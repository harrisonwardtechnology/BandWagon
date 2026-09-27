import { getSessionIdentity } from "@/lib/auth";
import { acceptInvitation, previewInvitation } from "@/lib/organization-invitations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateHeaders = { "cache-control": "no-store, private", "referrer-policy": "no-referrer" };

// The token travels in the POST body so it stays out of API URLs and logs.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const token = String(body.token || "");
  const identity = await getSessionIdentity().catch(() => null);
  try {
    if (body.action === "preview") {
      const invitation = await previewInvitation(token);
      if (!invitation) return Response.json({ error: "This invitation link is not valid" }, { status: 404, headers: privateHeaders });
      return Response.json({ ok: true, signedIn: Boolean(identity), invitation }, { headers: privateHeaders });
    }
    if (body.action === "accept") {
      if (!identity) return Response.json({ error: "Sign in to accept this invitation" }, { status: 401, headers: privateHeaders });
      const result = await acceptInvitation(identity, token);
      return Response.json({ ok: true, ...result }, { headers: privateHeaders });
    }
    return Response.json({ error: "Unknown action" }, { status: 400, headers: privateHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to accept invitation" }, { status: 400, headers: privateHeaders });
  }
}
