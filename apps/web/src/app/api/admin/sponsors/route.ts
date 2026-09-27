import { NextResponse } from "next/server";
import { requireSessionIdentity } from "@/lib/auth";
import { assertIdentityOrganizationAdmin } from "@/lib/admin-access";
import { listAdminOrganizations } from "@/lib/admin-operations";
import { createOrganizationSponsor, endOrganizationSponsor, listOrganizationSponsors, listSponsorContributions, updateOrganizationSponsor } from "@/lib/org-sponsors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Core Funding Boundary: this API returns sponsor recognition records and
// sponsorship payments only. It never returns participant data.
const headers = { "cache-control": "no-store, private" };

export async function GET(request: Request) {
  try {
    const identity = await requireSessionIdentity();
    const organizationId = new URL(request.url).searchParams.get("organizationId");
    if (!organizationId) return NextResponse.json({ ok: true, organizations: await listAdminOrganizations(identity) }, { headers });
    await assertIdentityOrganizationAdmin(identity, organizationId, { write: false, allowPlatformRoles: ["owner", "support", "finance", "readonly"] });
    const [sponsors, payments] = await Promise.all([listOrganizationSponsors(organizationId), listSponsorContributions(organizationId)]);
    return NextResponse.json({ ok: true, sponsors, payments }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Administrator access required" }, { status: 403, headers });
  }
}

export async function POST(request: Request) {
  let identity;
  let organizationId = "";
  let body: Record<string, unknown> = {};
  try {
    identity = await requireSessionIdentity();
    body = await request.json().catch(() => ({}));
    organizationId = String(body.organizationId || "");
    await assertIdentityOrganizationAdmin(identity, organizationId, { write: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Organization administrator access is required" }, { status: 403, headers });
  }
  try {
    const sponsorId = String(body.sponsorId || "");
    if (body.action === "create") return NextResponse.json({ ok: true, sponsor: await createOrganizationSponsor(identity, organizationId, body) }, { headers });
    if (body.action === "update") return NextResponse.json({ ok: true, sponsor: await updateOrganizationSponsor(identity, organizationId, sponsorId, body) }, { headers });
    if (body.action === "end") return NextResponse.json({ ok: true, sponsor: await endOrganizationSponsor(identity, organizationId, sponsorId) }, { headers });
    return NextResponse.json({ error: "Unknown action" }, { status: 400, headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save the sponsor" }, { status: 400, headers });
  }
}
