import crypto from "node:crypto";
import { getRedis } from "./redis";
import { getDb } from "./db";
import { lookupHash } from "./data-security";
import { normalizePhoneInput } from "./phone-format";
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

  // APP_URL is used because reverse proxies may alter the request's apparent origin.
  const configuredBase = (process.env.APP_URL || "").replace(/\/$/, "");
  const incoming = new URL(request.url);
  const publicUrl = configuredBase
    ? `${configuredBase}${incoming.pathname}${incoming.search}`
    : request.url;

  const expected = crypto
    .createHmac("sha1", authToken)
    .update(signatureBase(publicUrl, params), "utf8")
    .digest("base64");

  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function markOnce(key: string, ttlSeconds = 86400) {
  const redis = getRedis();
  if (!redis) return true;
  if (redis.status === "wait") await redis.connect();
  const result = await redis.set(`twilio:event:${key}`, "1", "EX", ttlSeconds, "NX");
  return result === "OK";
}

export async function setSmsConsent(phone: string, state: "opted_in" | "opted_out") {
  const redis = getRedis();
  if (!phone) return;
  if(redis){
    if (redis.status === "wait") await redis.connect();
    await redis.hset(`twilio:sms-consent:${phone}`, {
      state,
      updatedAt: new Date().toISOString(),
    }).catch(()=>undefined);
  }
  const normalized=normalizePhoneInput(phone,"US");
  const db=getDb();
  if(db&&normalized&&process.env.LOOKUP_HASH_KEY){
    await db.query(`update phones set messaging_consent_status=$1 where lookup_hash=$2 and verified_at is not null`,[state,lookupHash(normalized)]);
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
