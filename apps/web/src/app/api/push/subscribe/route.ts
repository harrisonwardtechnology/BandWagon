import { requireSessionIdentity } from "@/lib/auth";
import { savePushSubscription } from "@/lib/push";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let identity;
  try {
    identity = await requireSessionIdentity();
  } catch {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
    const p256dh = body?.keys?.p256dh;
    const auth = body?.keys?.auth;

    if (!endpoint || typeof p256dh !== "string" || typeof auth !== "string") {
      return Response.json({ error: "Invalid push subscription" }, { status: 400 });
    }

    // The subscription is always bound to the signed-in person. A client may
    // name one of its own organizations for routing, never someone else's.
    const requestedOrganizationId = typeof body.organizationId === "string" ? body.organizationId : null;
    const organizationId =
      requestedOrganizationId && identity.organizationIds.includes(requestedOrganizationId)
        ? requestedOrganizationId
        : null;

    await savePushSubscription({
      endpoint,
      p256dh,
      auth,
      userAgent: request.headers.get("user-agent"),
      deviceLabel: typeof body.deviceLabel === "string" ? body.deviceLabel.slice(0, 80) : null,
      personId: identity.personId,
      organizationId,
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to save push subscription" },
      { status: 500 }
    );
  }
}
