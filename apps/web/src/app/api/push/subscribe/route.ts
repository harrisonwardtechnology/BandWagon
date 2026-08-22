import { savePushSubscription } from "@/lib/push";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
    const p256dh = body?.keys?.p256dh;
    const auth = body?.keys?.auth;

    if (!endpoint || typeof p256dh !== "string" || typeof auth !== "string") {
      return Response.json({ error: "Invalid push subscription" }, { status: 400 });
    }

    await savePushSubscription({
      endpoint,
      p256dh,
      auth,
      userAgent: request.headers.get("user-agent"),
      deviceLabel: typeof body.deviceLabel === "string" ? body.deviceLabel : null,
      personId: typeof body.personId === "string" ? body.personId : null,
      organizationId: typeof body.organizationId === "string" ? body.organizationId : null,
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to save push subscription" },
      { status: 500 }
    );
  }
}
