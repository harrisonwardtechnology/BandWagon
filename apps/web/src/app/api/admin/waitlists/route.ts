import { NextResponse } from "next/server";
import { requireSessionIdentity } from "@/lib/auth";
import { assertIdentityOrganizationAdmin } from "@/lib/admin-access";
import { listAdminOrganizations } from "@/lib/admin-operations";
import { getWaitlistSettings, listOrganizationWaitlists, updateWaitlistSettings } from "@/lib/ride-waitlists";
import { DEPARTURE_CUTOFF_LIMITS, OFFER_WINDOW_LIMITS } from "@/lib/ride-waitlist-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "cache-control": "no-store, private" };

async function snapshot(organizationId: string) {
  return {
    settings: await getWaitlistSettings(organizationId),
    limits: { offerWindow: OFFER_WINDOW_LIMITS, departureCutoff: DEPARTURE_CUTOFF_LIMITS },
    ...(await listOrganizationWaitlists(organizationId)),
  };
}

export async function GET(request: Request) {
  try {
    const identity = await requireSessionIdentity();
    const organizationId = new URL(request.url).searchParams.get("organizationId");
    if (!organizationId) return NextResponse.json({ ok: true, organizations: await listAdminOrganizations(identity) }, { headers });
    await assertIdentityOrganizationAdmin(identity, organizationId, { write: false, allowPlatformRoles: ["owner", "support", "readonly"] });
    return NextResponse.json({ ok: true, ...(await snapshot(organizationId)) }, { headers });
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
    await updateWaitlistSettings(identity, { organizationId, enabled: body.enabled === true, offerWindowMinutes: body.offerWindowMinutes, departureCutoffMinutes: body.departureCutoffMinutes });
    return NextResponse.json({ ok: true, ...(await snapshot(organizationId)) }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update waitlist settings" }, { status: 400, headers });
  }
}
