import { NextResponse } from "next/server";
import { requirePlatformRole, requireSessionIdentity } from "@/lib/auth";
import { assertIdentityOrganizationAdmin } from "@/lib/admin-access";
import { listAdminOrganizations } from "@/lib/admin-operations";
import { getOrgUsage, listOrgTextingUsage, setOrgMessagingLimit } from "@/lib/org-messaging-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "cache-control": "no-store, private" };
const PLATFORM_VIEW_ROLES: Array<"owner" | "support" | "finance" | "readonly"> = ["owner", "support", "finance", "readonly"];

export async function GET(request: Request) {
  try {
    const identity = await requireSessionIdentity();
    const organizationId = new URL(request.url).searchParams.get("organizationId");
    const platformView = !identity.supportMode && Boolean(identity.platformRole && PLATFORM_VIEW_ROLES.includes(identity.platformRole));
    // Only the platform owner can change an organization's texting limit.
    const canEditLimits = !identity.supportMode && identity.platformRole === "owner";
    if (!organizationId) {
      const organizations = await listAdminOrganizations(identity);
      const overview = platformView ? await listOrgTextingUsage() : null;
      if (!organizations.length && !overview) throw new Error("Organization administrator access is required");
      return NextResponse.json({ ok: true, organizations, overview, canEditLimits }, { headers });
    }
    await assertIdentityOrganizationAdmin(identity, organizationId, { write: false, allowPlatformRoles: PLATFORM_VIEW_ROLES });
    const usage: any = await getOrgUsage(organizationId);
    // The platform owner's note on a limit is internal; org admins see usage only.
    if (!identity.platformRole && usage?.texting) usage.texting = { ...usage.texting, notes: null };
    return NextResponse.json({ ok: true, usage, canEditLimits }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Administrator access required" }, { status: 403, headers });
  }
}

export async function POST(request: Request) {
  let identity;
  try {
    identity = await requirePlatformRole(["owner"]);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Platform owner access is required" }, { status: 403, headers });
  }
  try {
    const body = await request.json().catch(() => ({}));
    if (body.action !== "set-limit") return NextResponse.json({ error: "Unknown action" }, { status: 400, headers });
    const organizationId = String(body.organizationId || "");
    const useDefault = body.useDefault === true || body.monthlyCostCapCents === null || body.monthlyCostCapCents === "";
    const limit = await setOrgMessagingLimit(identity, {
      organizationId,
      monthlyCostCapCents: useDefault ? null : Number(body.monthlyCostCapCents),
      alertThresholdPercent: body.alertThresholdPercent == null ? undefined : Number(body.alertThresholdPercent),
      notes: typeof body.notes === "string" ? body.notes : null,
    });
    return NextResponse.json({ ok: true, limit, usage: await getOrgUsage(organizationId) }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update the texting limit" }, { status: 400, headers });
  }
}
