import { requireAdminTestToken } from "@/lib/admin-test";
import { pushStatus, sendPushTest } from "@/lib/push";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = requireAdminTestToken(request);
  if (denied) return denied;
  return Response.json(await pushStatus());
}

export async function POST(request: Request) {
  const denied = requireAdminTestToken(request);
  if (denied) return denied;

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
