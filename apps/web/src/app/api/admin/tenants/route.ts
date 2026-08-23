import { requireAdminTestToken } from "@/lib/admin-test";
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
  return Response.json({ organizations: await listOrganizations() });
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
      const result = await requestCustomDomain({
        organizationId: String(body.organizationId || ""),
        hostname: String(body.hostname || ""),
      });
      return Response.json({ ok: true, ...result });
    }

    if (action === "verify-domain") {
      const result = await verifyCustomDomain(String(body.domainId || ""));
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
