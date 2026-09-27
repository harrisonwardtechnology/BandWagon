import { requireSessionIdentity } from "@/lib/auth";
import { createInvitation, listInvitations, revokeInvitation } from "@/lib/organization-invitations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateHeaders = { "cache-control": "no-store, private" };

function status(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "Authentication required") return 401;
  if (/access is required|read-only/.test(message)) return 403;
  return 400;
}

export async function GET(request: Request) {
  try {
    const identity = await requireSessionIdentity();
    const organizationId = new URL(request.url).searchParams.get("organizationId") || "";
    return Response.json({ ok: true, ...(await listInvitations(identity, organizationId)) }, { headers: privateHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load invitations" }, { status: status(error), headers: privateHeaders });
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireSessionIdentity();
    const body = await request.json().catch(() => ({}));
    const organizationId = String(body.organizationId || "");
    if (body.action === "create") {
      const result = await createInvitation(identity, { organizationId, email: String(body.email || ""), role: body.role });
      return Response.json({ ok: true, ...result }, { status: 201, headers: privateHeaders });
    }
    if (body.action === "revoke") {
      await revokeInvitation(identity, { organizationId, invitationId: String(body.invitationId || "") });
      return Response.json({ ok: true }, { headers: privateHeaders });
    }
    return Response.json({ error: "Unknown action" }, { status: 400, headers: privateHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invitation failed" }, { status: status(error), headers: privateHeaders });
  }
}
