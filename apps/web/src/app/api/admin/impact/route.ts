import { NextResponse } from "next/server";
import { requireSessionIdentity } from "@/lib/auth";
import { assertIdentityOrganizationAdmin } from "@/lib/admin-access";
import { listAdminOrganizations } from "@/lib/admin-operations";
import { buildImpactCsv, buildImpactReport, updateImpactSettings } from "@/lib/org-impact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "cache-control": "no-store, private" };

export async function GET(request: Request) {
  try {
    const identity = await requireSessionIdentity();
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId");
    if (!organizationId) return NextResponse.json({ ok: true, organizations: await listAdminOrganizations(identity) }, { headers });
    await assertIdentityOrganizationAdmin(identity, organizationId, { write: false, allowPlatformRoles: ["owner", "support", "finance", "readonly"] });
    if (url.searchParams.get("format") === "csv") {
      const csv = await buildImpactCsv(organizationId);
      return new Response(csv.body, {
        headers: { ...headers, "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${csv.filename.replace(/[^a-z0-9._-]/gi, "-")}"` },
      });
    }
    return NextResponse.json({ ok: true, report: await buildImpactReport(organizationId) }, { headers });
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
    if (body.action !== "update-settings") return NextResponse.json({ error: "Unknown action" }, { status: 400, headers });
    await updateImpactSettings(identity, { organizationId, publicImpactEnabled: body.publicImpactEnabled === true, milesPerTrip: body.milesPerTrip, minutesPerTrip: body.minutesPerTrip });
    return NextResponse.json({ ok: true, report: await buildImpactReport(organizationId) }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update impact settings" }, { status: 400, headers });
  }
}
