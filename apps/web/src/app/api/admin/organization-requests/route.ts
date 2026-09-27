import { requirePlatformRole } from "@/lib/auth";
import { ORGANIZATION_REVIEW_CHECKLIST, ORGANIZATION_TYPES } from "@/lib/organization-onboarding-policy";
import { decideOrganizationRequest, listOrganizationRequests } from "@/lib/organization-requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateHeaders = { "cache-control": "no-store, private" };

export async function GET(request: Request) {
  let identity;
  try { identity = await requirePlatformRole(["owner", "support"]); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Platform administrator access is required" }, { status: 403, headers: privateHeaders }); }
  try {
    const status = new URL(request.url).searchParams.get("status");
    return Response.json({
      requests: await listOrganizationRequests(status),
      checklist: ORGANIZATION_REVIEW_CHECKLIST,
      organizationTypes: ORGANIZATION_TYPES,
      canDecide: identity.platformRole === "owner",
    }, { headers: privateHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load requests" }, { status: 500, headers: privateHeaders });
  }
}

export async function POST(request: Request) {
  let identity;
  try { identity = await requirePlatformRole(["owner"]); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Platform owner access is required" }, { status: 403, headers: privateHeaders }); }
  const body = await request.json().catch(() => ({}));
  const decision = body.action === "approve" ? "approve" : body.action === "reject" ? "reject" : null;
  if (!decision) return Response.json({ error: "Unknown action" }, { status: 400, headers: privateHeaders });
  try {
    const result = await decideOrganizationRequest(identity, {
      requestId: String(body.requestId || ""),
      decision,
      note: typeof body.note === "string" ? body.note : null,
      checklist: body.checklist,
    });
    return Response.json({ ok: true, organization: result.organization, emailSent: result.emailSent }, { headers: privateHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to decide request" }, { status: 400, headers: privateHeaders });
  }
}
