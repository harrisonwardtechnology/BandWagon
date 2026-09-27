// Passkey (WebAuthn) policy. Pure functions only (no imports) so tests can
// load this file directly. Server wiring lives in passkeys.ts.

export const PASSKEY_CHALLENGE_TTL_SECONDS = 300;
export const PASSKEY_RECENT_SIGN_IN_MS = 10 * 60 * 1000;
export const PASSKEY_NICKNAME_MAX = 60;
export const PASSKEY_MAX_PER_PERSON = 20;
export const PASSKEY_FLOW_COOKIE = "bw_passkey_flow";
export const PASSKEY_EXPLAINER = "Sign in with your face, fingerprint, or screen lock.";

/** PASSKEYS_ENABLED defaults to on. "false", "0", "off", or "no" turns it off. */
export function passkeysEnabled(value: string | undefined) {
  const v = String(value ?? "").trim().toLowerCase();
  return !["false", "0", "off", "no"].includes(v);
}

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

function isHostname(value: string) {
  return /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
}

/** Splits a Host header into a clean hostname and optional port. Null when malformed. */
export function parseHostHeader(value: string | null | undefined): { hostname: string; port: string | null } | null {
  const raw = String(value || "").split(",")[0].trim().toLowerCase();
  if (!raw || raw.includes("/") || raw.includes("@")) return null;
  const match = /^([^:]+)(?::(\d{1,5}))?$/.exec(raw);
  if (!match) return null;
  const hostname = match[1].replace(/\.$/, "");
  if (!isHostname(hostname)) return null;
  return { hostname, port: match[2] || null };
}

export type PasskeyHostConfig = {
  /** Configured product hostnames (PLATFORM_HOSTNAMES). */
  platformHosts: string[];
  /** Parent domain for tenant hostnames (TENANT_BASE_DOMAIN), e.g. bandwagon.club. */
  tenantBase: string;
  /** Old product hostnames that only redirect. Passkeys are never offered there. */
  legacyPlatformHosts?: string[];
  /** Old tenant parent domains that only redirect. */
  legacyTenantBases?: string[];
  /** True when production. localhost is only accepted outside production. */
  production: boolean;
};

export type PasskeyRelyingParty = {
  rpId: string;
  origin: string;
  hostname: string;
  kind: "platform" | "tenant" | "custom_domain" | "local";
};

/**
 * Picks the WebAuthn relying party for a request host.
 *
 * - The platform and every <slug>.<tenantBase> host share rpId = tenantBase, so
 *   one passkey works on bandwagon.club and all community subdomains.
 * - A custom domain (flomogo.app) uses its own hostname as the rpId.
 * - Unknown hosts get null. `knownTenantHost` must come from the database
 *   (an active organization_domains row), never from the request itself.
 */
export function resolvePasskeyRelyingParty(
  host: string | null | undefined,
  config: PasskeyHostConfig,
  knownTenantHost: boolean
): PasskeyRelyingParty | null {
  const parsed = parseHostHeader(host);
  if (!parsed) return null;
  const { hostname, port } = parsed;

  if (LOCAL_HOSTNAMES.has(hostname)) {
    if (config.production) return null;
    return { rpId: hostname, origin: `http://${hostname}${port ? `:${port}` : ""}`, hostname, kind: "local" };
  }
  // Browsers only allow WebAuthn over https off localhost; default port only.
  if (port && port !== "443") return null;

  const legacyPlatform = config.legacyPlatformHosts || [];
  const legacyTenant = config.legacyTenantBases || [];
  const tenantBase = config.tenantBase.toLowerCase();
  const platformHosts = config.platformHosts.map((h) => h.toLowerCase());
  if (legacyPlatform.includes(hostname) && !platformHosts.includes(hostname)) return null;
  if (legacyTenant.some((base) => base !== tenantBase && (hostname === base || hostname.endsWith(`.${base}`)))) return null;

  const underBase = hostname === tenantBase || hostname.endsWith(`.${tenantBase}`);
  const origin = `https://${hostname}`;

  if (platformHosts.includes(hostname)) {
    return { rpId: underBase ? tenantBase : hostname, origin, hostname, kind: "platform" };
  }
  if (!knownTenantHost) return null;
  if (underBase) {
    const label = hostname.slice(0, -(tenantBase.length + 1));
    // Tenant hostnames are exactly one label deep.
    if (!label || label.includes(".")) return null;
    return { rpId: tenantBase, origin, hostname, kind: "tenant" };
  }
  return { rpId: hostname, origin, hostname, kind: "custom_domain" };
}

/**
 * The browser's Origin header must match the relying party we computed from
 * the (validated) host. Missing or different origins are rejected.
 */
export function requestOriginAllowed(originHeader: string | null | undefined, rp: PasskeyRelyingParty | null) {
  if (!rp || !originHeader) return false;
  let parsed: URL;
  try {
    parsed = new URL(originHeader);
  } catch {
    return false;
  }
  if (parsed.origin === "null") return false;
  return parsed.origin.toLowerCase() === rp.origin;
}

/** Adding a passkey needs a sign-in within the last ten minutes. */
export function signInIsRecent(sessionCreatedAt: Date | string | null | undefined, now = Date.now(), windowMs = PASSKEY_RECENT_SIGN_IN_MS) {
  if (!sessionCreatedAt) return false;
  const created = new Date(sessionCreatedAt).getTime();
  if (!Number.isFinite(created)) return false;
  return now - created <= windowMs && created <= now + 60_000;
}

/** Cleans a user-supplied passkey name. Falls back to a device-based default. */
export function cleanPasskeyNickname(value: unknown, fallback = "Passkey") {
  const cleaned = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PASSKEY_NICKNAME_MAX)
    .trim();
  return cleaned || fallback;
}

/** A friendly default name from the browser user agent. */
export function defaultPasskeyNickname(userAgent: string | null | undefined) {
  const ua = String(userAgent || "");
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android phone";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows PC";
  if (/CrOS/i.test(ua)) return "Chromebook";
  if (/Linux/i.test(ua)) return "Linux computer";
  return "Passkey";
}

/** Only relative in-app paths are allowed as a post sign-in destination. */
export function safeNextPath(value: string | null | undefined) {
  const v = String(value || "");
  if (!v.startsWith("/app") || v.startsWith("//") || v.includes("\\") || /[\u0000-\u001f]/.test(v)) return "/app";
  if (v.length > 200) return "/app";
  return v;
}

// ---------------------------------------------------------------------------
// Challenge storage contract. Every challenge is bound to one flow key and can
// be consumed exactly once. Redis and Postgres stores implement this in
// passkeys.ts; the memory store below is used by tests and as a reference.

export type StoredChallenge = {
  challenge: string;
  rpId: string;
  origin: string;
  userAccountId?: string | null;
};

export interface ChallengeStore {
  put(flowKey: string, value: StoredChallenge, ttlSeconds: number): Promise<void>;
  /** Returns the value and deletes it atomically. Null when missing or expired. */
  consume(flowKey: string): Promise<StoredChallenge | null>;
}

export function registrationFlowKey(sessionId: string) {
  return `passkey:reg:${sessionId}`;
}

export function authenticationFlowKey(flowId: string) {
  return `passkey:auth:${flowId}`;
}

export function isValidFlowId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{32,64}$/.test(value);
}

export function createMemoryChallengeStore(now: () => number = Date.now): ChallengeStore {
  const entries = new Map<string, { value: StoredChallenge; expiresAt: number }>();
  return {
    async put(flowKey, value, ttlSeconds) {
      entries.set(flowKey, { value, expiresAt: now() + ttlSeconds * 1000 });
    },
    async consume(flowKey) {
      const entry = entries.get(flowKey);
      entries.delete(flowKey);
      if (!entry || entry.expiresAt < now()) return null;
      return entry.value;
    },
  };
}

/**
 * Checks a consumed challenge against the current request. The stored rpId
 * and origin must equal the ones computed now, so a challenge issued on one
 * host cannot be finished on another.
 */
export function challengeMatchesRequest(stored: StoredChallenge | null, rp: PasskeyRelyingParty | null, userAccountId?: string | null) {
  if (!stored || !rp) return false;
  if (stored.rpId !== rp.rpId || stored.origin !== rp.origin) return false;
  if (userAccountId !== undefined && (stored.userAccountId || null) !== (userAccountId || null)) return false;
  return true;
}
