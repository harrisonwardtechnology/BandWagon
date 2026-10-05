import { privateHashConfigured, privateHmac } from "@/lib/private-hash";
import { glitchTipConfigured, reportToGlitchTip } from "@/lib/glitchtip";
import { getRedis } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Browser error reports from our own pages, forwarded to GlitchTip.
// Same-origin only, small bodies, rate limited per IP, and redacted before
// sending. Nothing is stored in BandWagon's database.

const MAX_BODY = 8 * 1024;
const noStore = { "cache-control": "no-store" };

function clean(value: unknown, max: number) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").slice(0, max);
}

function ipKey(request: Request) {
  const ip = String(request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").trim();
  return privateHmac(ip).slice(0, 32);
}

async function allowed(request: Request) {
  const redis = getRedis();
  if (!redis) return true; // the per-process GlitchTip throttle still applies
  // No hash key configured: drop the report instead of hashing IPs with a built-in key or skipping the limit.
  if (!privateHashConfigured()) return false;
  if (redis.status === "wait") await redis.connect();
  const key = `client-errors:${ipKey(request)}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 600);
  return count <= 20;
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").split(",")[0].trim().toLowerCase();
  if (!origin || !host) return false;
  try { return new URL(origin).host.toLowerCase() === host; } catch { return false; }
}

export async function POST(request: Request) {
  // Always 204 to the browser: error reporting must never surface to users.
  const done = new Response(null, { status: 204, headers: noStore });
  if (!glitchTipConfigured() || !sameOrigin(request)) return done;
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY) return done;
  const text = await request.text().catch(() => "");
  if (!text || text.length > MAX_BODY) return done;
  if (!(await allowed(request).catch(() => true))) return done;

  let body: Record<string, unknown>;
  try { body = JSON.parse(text); } catch { return done; }
  const message = clean(body.message, 1000);
  if (!message) return done;
  await reportToGlitchTip({
    source: "browser",
    name: clean(body.name, 120) || "Error",
    message,
    stack: clean(body.stack, 6000) || null,
    route: clean(body.path, 300),
    level: "error",
    tags: {
      kind: clean(body.kind, 30) || "error",
      release_client: clean(body.release, 60) || null,
    },
  });
  return done;
}
