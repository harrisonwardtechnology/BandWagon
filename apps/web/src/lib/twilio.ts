import crypto from "node:crypto";
import { getRedis } from "./redis";
import { legacyPlatformHostnames, platformHostnames } from "./platform-hosts";
import { parseTwilioForm, type TwilioForm } from "./twilio-form";

export { parseTwilioForm };
export type { TwilioForm };

function signatureBase(url: string, params: TwilioForm) {
  return url + Object.keys(params).sort().map((key) => key + params[key]).join("");
}

export function validateTwilioSignature(request: Request, params: TwilioForm) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return process.env.NODE_ENV !== "production";

  const supplied = request.headers.get("x-twilio-signature");
  if (!supplied) return false;

  // Twilio signs the exact public URL it called. Reverse proxies change the
  // apparent origin, so check against the configured public hosts instead:
  // APP_URL, the platform hosts, and the legacy hosts (webhooks registered on
  // the old domain keep validating during and after the domain move).
  const incoming = new URL(request.url);
  const suffix = `${incoming.pathname}${incoming.search}`;
  const bases = new Set<string>();
  const configuredBase = (process.env.APP_URL || "").replace(/\/$/, "");
  if (configuredBase) bases.add(configuredBase);
  for (const host of [...platformHostnames(), ...legacyPlatformHostnames()]) bases.add(`https://${host}`);
  const candidates = bases.size ? [...bases].map((base) => `${base}${suffix}`) : [request.url];

  const a = Buffer.from(supplied);
  return candidates.some((url) => {
    const b = Buffer.from(crypto.createHmac("sha1", authToken).update(signatureBase(url, params), "utf8").digest("base64"));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

export async function markOnce(key: string, ttlSeconds = 86400) {
  const redis = getRedis();
  if (!redis) return true;
  if (redis.status === "wait") await redis.connect();
  const result = await redis.set(`twilio:event:${key}`, "1", "EX", ttlSeconds, "NX");
  return result === "OK";
}

// Best-effort operational mirror only. Postgres (sms_opt_outs + phones) is the
// source of truth for whether a text may be sent; nothing reads this for sends.
export async function mirrorSmsConsentToRedis(phone: string, state: "opted_in" | "opted_out") {
  const redis = getRedis();
  if (!phone || !redis) return;
  try {
    if (redis.status === "wait") await redis.connect();
    await redis.hset(`twilio:sms-consent:${phone}`, { state, updatedAt: new Date().toISOString() });
  } catch {
    // ignore: mirror only
  }
}

export function twiml(xml: string) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${xml}</Response>`, {
    status: 200,
    headers: { "content-type": "text/xml; charset=utf-8" },
  });
}

export function emptyTwiml() {
  return twiml("");
}

export function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (c) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;"
  }[c] || c));
}
