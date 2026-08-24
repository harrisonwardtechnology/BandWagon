import { requirePlatformRole } from "@/lib/auth";
import { pushStatus, sendPushTest } from "@/lib/push";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try { await requirePlatformRole(["owner","support"]); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Platform administrator access is required" }, { status: 403 }); }
  return Response.json(await pushStatus());
}

export async function POST(request: Request) {
  try { await requirePlatformRole(["owner"]); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Platform owner access is required" }, { status: 403 }); }

  const body = await request.json().catch(() => ({}));

  const result = await sendPushTest({
    organizationId: typeof body.organizationId === "string" ? body.organizationId : null,
    endpoint: typeof body.endpoint === "string" ? body.endpoint : null,
    payload: {
      title: typeof body.title === "string" ? body.title : "BandWagon",
      body:
        typeof body.body === "string"
          ? body.body
          : "Push notifications are working. This can replace routine SMS messages.",
      url: typeof body.url === "string" ? body.url : "/",
      tag: "bandwagon-platform-test",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    },
  });

  return Response.json({ ok: true, ...result });
}
