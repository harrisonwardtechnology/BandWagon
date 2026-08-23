import { requireAdminTestToken } from "@/lib/admin-test";
import { getDb } from "@/lib/db";
import { createAutomaticDomainSetup, domainSetupCapabilities } from "@/lib/domain-setup-provider";
import {
  createOrganization,
  listOrganizations,
  requestCustomDomain,
  setPrimaryDomain,
  verifyCustomDomain,
} from "@/lib/saas-tenants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = requireAdminTestToken(request);
  if (denied) return denied;
  return Response.json({ organizations: await listOrganizations(), domainSetup: domainSetupCapabilities() });
}

export async function POST(request: Request) {
  const denied = requireAdminTestToken(request);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "create");

  try {
    if (action === "create") {
      const organization = await createOrganization({
        name: String(body.name || ""),
        slug: String(body.slug || body.name || ""),
        discoverability: typeof body.discoverability === "string" ? body.discoverability : "unlisted",
      });
      return Response.json({ ok: true, organization });
    }

    if (action === "request-domain") {
      const setupMode = body.setupMode === "automatic" ? "automatic" : "manual";
      const result = await requestCustomDomain({
        organizationId: String(body.organizationId || ""),
        hostname: String(body.hostname || ""),
      });
      const db = getDb();
      if (!db) throw new Error("Database is not configured");

      if (setupMode === "manual") {
        await db.query(`update organization_domains set setup_mode='manual',setup_provider='bandwagon',setup_status='pending',setup_last_error=null,setup_updated_at=now() where id=$1`,[result.domain.id]);
        return Response.json({ ok: true, ...result, setupMode, setupProvider:"bandwagon", automatic:null });
      }

      try {
        const origin = new URL(request.url).origin;
        const automatic = await createAutomaticDomainSetup({hostname:result.domain.hostname,targetHostname:result.cname.target,returnUrl:`${origin}/admin/tenants`});
        if (!automatic.available) {
          await db.query(`update organization_domains set setup_mode='automatic',setup_provider='dodomain',setup_status='manual_required',setup_last_error=$2,setup_updated_at=now() where id=$1`,[result.domain.id,automatic.reason]);
          return Response.json({ ok:true,...result,setupMode,setupProvider:"dodomain",automatic });
        }
        await db.query(`update organization_domains set setup_mode='automatic',setup_provider='dodomain',setup_provider_session_id=$2,setup_status='pending',setup_last_error=null,setup_updated_at=now() where id=$1`,[result.domain.id,automatic.sessionId]);
        return Response.json({ ok:true,...result,setupMode,setupProvider:"dodomain",automatic });
      } catch(error) {
        const message=error instanceof Error?error.message:"Automatic domain setup failed";
        await db.query(`update organization_domains set setup_mode='automatic',setup_provider='dodomain',setup_status='failed',setup_last_error=$2,setup_updated_at=now() where id=$1`,[result.domain.id,message]);
        return Response.json({ok:true,...result,setupMode,setupProvider:"dodomain",automatic:{available:false,reason:message,fallback:"manual"}});
      }
    }

    if (action === "verify-domain") {
      const result = await verifyCustomDomain(String(body.domainId || ""));
      const db=getDb();
      if(db&&result.active)await db.query(`update organization_domains set setup_status='verified',setup_last_error=null,setup_updated_at=now() where id=$1`,[String(body.domainId||"")]);
      return Response.json({ ok: true, ...result });
    }

    if (action === "set-primary") {
      await setPrimaryDomain(String(body.organizationId || ""), String(body.domainId || ""));
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown tenant action" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Tenant operation failed" },
      { status: 400 }
    );
  }
}
