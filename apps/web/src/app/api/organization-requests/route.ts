import { privateHashConfigured, privateHmac } from "@/lib/private-hash";
import { getSessionIdentity } from "@/lib/auth";
import { getRedis } from "@/lib/redis";
import { turnstileConfigured, verifyTurnstileToken } from "@/lib/turnstile";
import { tenantBaseDomain } from "@/lib/saas-tenants";
import { ORGANIZATION_AGREEMENT_VERSION, validateOrganizationRequest } from "@/lib/organization-onboarding-policy";
import {
  checkRequestedSlug,
  createOrganizationRequest,
  listRequestsForPerson,
  withdrawOrganizationRequest,
} from "@/lib/organization-requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateHeaders = { "cache-control": "no-store, private" };

function clientIp(request: Request) {
  return String(request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").trim().slice(0, 100);
}
function privateKey(value: string) {
  return privateHmac(value).slice(0, 32);
}
async function requestAllowed(request: Request, personId: string) {
  const redis = getRedis();
  if (!redis) return true;
  if (redis.status === "wait") await redis.connect();
  for (const item of [
    { key: `org-request:ip:${privateKey(clientIp(request))}`, limit: 10 },
    { key: `org-request:person:${privateKey(personId)}`, limit: 5 },
  ]) {
    const count = await redis.incr(item.key);
    if (count === 1) await redis.expire(item.key, 3600);
    if (count > item.limit) return false;
  }
  return true;
}

export async function GET(request: Request) {
  const identity = await getSessionIdentity().catch(() => null);
  const url = new URL(request.url);
  const meta = { agreementVersion: ORGANIZATION_AGREEMENT_VERSION, baseDomain: tenantBaseDomain(), turnstileRequired: turnstileConfigured() };
  if (!identity) return Response.json({ signedIn: false, ...meta }, { status: 401, headers: privateHeaders });
  try {
    const slug = url.searchParams.get("slug");
    if (slug !== null) return Response.json({ signedIn: true, slugCheck: await checkRequestedSlug(slug) }, { headers: privateHeaders });
    return Response.json({ signedIn: true, displayName: identity.displayName, requests: await listRequestsForPerson(identity.personId), ...meta }, { headers: privateHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load requests" }, { status: 500, headers: privateHeaders });
  }
}

export async function POST(request: Request) {
  const identity = await getSessionIdentity().catch(() => null);
  if (!identity) return Response.json({ error: "Sign in to start a community" }, { status: 401, headers: privateHeaders });
  const body = await request.json().catch(() => ({}));
  try {
    if (body.action === "withdraw") {
      await withdrawOrganizationRequest(identity, String(body.requestId || ""));
      return Response.json({ ok: true, requests: await listRequestsForPerson(identity.personId) }, { headers: privateHeaders });
    }
    if (body.action !== "create") return Response.json({ error: "Unknown action" }, { status: 400, headers: privateHeaders });

    const validation = validateOrganizationRequest(body);
    if (!validation.ok) return Response.json({ error: "Please fix the highlighted fields", fields: validation.errors }, { status: 400, headers: privateHeaders });
    if (turnstileConfigured() && !await verifyTurnstileToken(request, body.turnstileToken, "organization_request").catch(() => false)) {
      return Response.json({ error: "The security check was unsuccessful. Please try again." }, { status: 400, headers: privateHeaders });
    }
    // Rate limiting and the stored IP hash need a hash key. Without one, refuse instead of using a built-in key.
    if (!privateHashConfigured()) return Response.json({ error: "Community requests are temporarily unavailable." }, { status: 503, headers: privateHeaders });
    if (!await requestAllowed(request, identity.personId).catch(() => true)) {
      return Response.json({ error: "Too many requests were sent recently. Please wait before trying again." }, { status: 429, headers: privateHeaders });
    }
    const created = await createOrganizationRequest(identity, validation.value, clientIp(request));
    return Response.json({ ok: true, requestId: created.id, requests: await listRequestsForPerson(identity.personId) }, { status: 201, headers: privateHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to send request" }, { status: 400, headers: privateHeaders });
  }
}
