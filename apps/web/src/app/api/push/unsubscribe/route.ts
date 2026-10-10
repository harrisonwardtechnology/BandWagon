import { requireSessionIdentity } from "@/lib/auth";
import { revokePushSubscription } from "@/lib/push";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let identity;
  try {
    identity = await requireSessionIdentity();
  } catch {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  if (!endpoint) return Response.json({ error: "endpoint is required" }, { status: 400 });

  // Only the owner of a subscription (or an unclaimed legacy row) can revoke it.
  await revokePushSubscription(endpoint, identity.personId);
  return Response.json({ ok: true });
}
