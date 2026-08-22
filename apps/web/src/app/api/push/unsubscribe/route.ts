import { revokePushSubscription } from "@/lib/push";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  if (!endpoint) return Response.json({ error: "endpoint is required" }, { status: 400 });

  await revokePushSubscription(endpoint);
  return Response.json({ ok: true });
}
