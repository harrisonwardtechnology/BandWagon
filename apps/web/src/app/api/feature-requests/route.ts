import { privateHashConfigured } from "@/lib/private-hash";
import { getSessionIdentity } from "@/lib/auth";
import { turnstileConfigured, verifyTurnstileToken } from "@/lib/turnstile";
import {
  FEATURE_REQUEST_CATEGORIES,
  FEATURE_REQUEST_LIMITS,
  FEATURE_REQUEST_STATUSES,
  normalizeSort,
  validateFeatureRequest,
} from "@/lib/feature-request-policy";
import {
  clientIp,
  createFeatureRequest,
  listFeatureRequestsForPerson,
  setFeatureRequestVote,
  submitAllowed,
  voteAllowed,
} from "@/lib/feature-requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateHeaders = { "cache-control": "no-store, private" };
const meta = () => ({ categories: FEATURE_REQUEST_CATEGORIES, statuses: FEATURE_REQUEST_STATUSES, limits: FEATURE_REQUEST_LIMITS, turnstileRequired: turnstileConfigured() });

export async function GET(request: Request) {
  const identity = await getSessionIdentity().catch(() => null);
  if (!identity) return Response.json({ signedIn: false, ...meta() }, { headers: privateHeaders });
  try {
    const url = new URL(request.url);
    const requests = await listFeatureRequestsForPerson(identity.personId, { sort: normalizeSort(url.searchParams.get("sort")), category: url.searchParams.get("category") });
    return Response.json({ signedIn: true, requests, ...meta() }, { headers: privateHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load ideas" }, { status: 500, headers: privateHeaders });
  }
}

export async function POST(request: Request) {
  const identity = await getSessionIdentity().catch(() => null);
  const body = await request.json().catch(() => ({}));
  const ip = clientIp(request);
  // Rate limits and the stored IP hash need a hash key. Without one, refuse instead of using a built-in key or skipping a limit.
  if (!privateHashConfigured()) return Response.json({ error: "Feature ideas are temporarily unavailable." }, { status: 503, headers: privateHeaders });
  try {
    if (body.action === "vote") {
      if (!identity) return Response.json({ error: "Sign in to vote" }, { status: 401, headers: privateHeaders });
      if (!await voteAllowed(identity.personId).catch(() => true)) {
        return Response.json({ error: "Too many votes were sent recently. Please wait before trying again." }, { status: 429, headers: privateHeaders });
      }
      const result = await setFeatureRequestVote(identity, String(body.requestId || ""), body.vote !== false);
      return Response.json({ ok: true, ...result }, { headers: privateHeaders });
    }
    if (body.action !== "create") return Response.json({ error: "Unknown action" }, { status: 400, headers: privateHeaders });

    // Honeypot: bots that fill the hidden field get a quiet success.
    if (String(body.companyWebsite || "").trim()) return Response.json({ ok: true }, { status: 201, headers: privateHeaders });
    const validation = validateFeatureRequest(body, { signedIn: Boolean(identity) });
    if (!validation.ok) return Response.json({ error: "Please fix the highlighted fields", fields: validation.errors }, { status: 400, headers: privateHeaders });

    if (!identity) {
      if (!turnstileConfigured()) return Response.json({ error: "Sign in to suggest a feature. The public form is temporarily unavailable." }, { status: 503, headers: privateHeaders });
      if (!await verifyTurnstileToken(request, body.turnstileToken, "feature_request").catch(() => false)) {
        return Response.json({ error: "The security check was unsuccessful. Please try again." }, { status: 400, headers: privateHeaders });
      }
    }
    if (!await submitAllowed(ip, { personId: identity?.personId || null, email: validation.value.email }).catch(() => false)) {
      return Response.json({ error: "Too many ideas were sent recently. Please wait before trying again." }, { status: 429, headers: privateHeaders });
    }
    const created = await createFeatureRequest({ identity, value: validation.value, organizationId: typeof body.organizationId === "string" ? body.organizationId : null, sourceIp: ip });
    return Response.json({ ok: true, requestId: created.id }, { status: 201, headers: privateHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to send your idea" }, { status: 400, headers: privateHeaders });
  }
}
