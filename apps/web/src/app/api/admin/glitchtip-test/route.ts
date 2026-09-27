import { requirePlatformRole } from "@/lib/auth";
import { glitchTipConfigured, reportToGlitchTip } from "@/lib/glitchtip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "cache-control": "no-store, private" };

/** Platform owner sends one test event to confirm the GlitchTip DSN works. */
export async function POST() {
  try { await requirePlatformRole(["owner"]); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Platform owner access is required" }, { status: 403, headers }); }
  if (!glitchTipConfigured()) return Response.json({ ok: false, error: "GLITCHTIP_DSN is not set or is not a valid DSN" }, { status: 400, headers });
  const result = await reportToGlitchTip({
    source: "server",
    name: "GlitchTipTestEvent",
    message: "BandWagon test event from the Platform Health page",
    route: "/api/admin/glitchtip-test",
    level: "info",
    fingerprint: ["glitchtip-test", String(Date.now())],
  });
  return Response.json({ ok: result.sent, ...result }, { status: result.sent ? 200 : 502, headers });
}
