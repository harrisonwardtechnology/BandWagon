import crypto from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { getDb } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import type { SessionIdentity } from "@/lib/auth";
import { completeSignIn, findSignInEligibleAccount, requestIpHash } from "@/lib/auth-service";
import { sendEmailNotification } from "@/lib/email-send";
import { resolveOrganizationByHostname } from "@/lib/saas-tenants";
import {
  legacyPlatformHostnames,
  legacyTenantBaseDomains,
  platformHostnames,
  tenantBaseDomain,
} from "@/lib/platform-hosts";
import {
  PASSKEY_CHALLENGE_TTL_SECONDS,
  PASSKEY_MAX_PER_PERSON,
  authenticationFlowKey,
  challengeMatchesRequest,
  cleanPasskeyNickname,
  defaultPasskeyNickname,
  isValidFlowId,
  parseHostHeader,
  passkeysEnabled,
  registrationFlowKey,
  requestOriginAllowed,
  resolvePasskeyRelyingParty,
  signInIsRecent,
  type ChallengeStore,
  type PasskeyRelyingParty,
  type StoredChallenge,
} from "@/lib/passkey-policy";

const RP_NAME = "BandWagon";
const SIGN_IN_FAILED = "We could not sign you in with that passkey. Try again, or use a code instead.";

// Rate limits, per rolling window.
const AUTH_OPTIONS_PER_IP = 30; // sign-in ceremonies started per IP per 15 minutes
const AUTH_FAILURES_PER_IP = 20; // failed passkey sign-ins per IP per 15 minutes
const REGISTRATIONS_PER_ACCOUNT = 10; // registration ceremonies per account per hour

export class PasskeyError extends Error {
  code: string;
  status: number;
  constructor(message: string, code = "passkey_error", status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function dbRequired() {
  const db = getDb();
  if (!db) throw new PasskeyError("Passkeys are temporarily unavailable", "unavailable", 503);
  return db;
}

export function passkeysFeatureEnabled() {
  return passkeysEnabled(process.env.PASSKEYS_ENABLED);
}

function assertEnabled() {
  if (!passkeysFeatureEnabled()) throw new PasskeyError("Passkeys are turned off", "disabled", 404);
}

export function requestIp(request: Request) {
  return (request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for") || "")
    .split(",")[0]
    .trim() || null;
}

function requestHost(request: Request) {
  return request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
}

/**
 * The relying party for this request, or null for unknown hosts. The host is
 * accepted only if it is a configured platform host or an active, verified
 * organization domain in the database.
 */
export async function relyingPartyForRequest(request: Request): Promise<PasskeyRelyingParty | null> {
  const host = requestHost(request);
  const parsed = parseHostHeader(host);
  if (!parsed) return null;
  const config = {
    platformHosts: platformHostnames(),
    tenantBase: tenantBaseDomain(),
    legacyPlatformHosts: legacyPlatformHostnames(),
    legacyTenantBases: legacyTenantBaseDomains(),
    production: process.env.NODE_ENV === "production",
  };
  const direct = resolvePasskeyRelyingParty(host, config, false);
  if (direct) return direct;
  const organization = await resolveOrganizationByHostname(parsed.hostname).catch(() => null);
  return resolvePasskeyRelyingParty(host, config, Boolean(organization));
}

async function requireRelyingParty(request: Request) {
  const rp = await relyingPartyForRequest(request);
  if (!rp) throw new PasskeyError("Passkeys are not available on this address", "unknown_host", 400);
  if (!requestOriginAllowed(request.headers.get("origin"), rp)) {
    throw new PasskeyError("This request did not come from this site", "origin_mismatch", 403);
  }
  return rp;
}

// ---------------------------------------------------------------------------
// Challenge store: Redis with a short TTL when configured, Postgres otherwise.

const REDIS_PREFIX = "bandwagon:webauthn:";

const postgresChallengeStore: ChallengeStore = {
  async put(flowKey, value, ttlSeconds) {
    await dbRequired().query(
      `insert into webauthn_challenges (flow_key,challenge,payload,created_at,expires_at)
       values ($1,$2,$3::jsonb,now(),now()+($4||' seconds')::interval)
       on conflict (flow_key) do update set
         challenge=excluded.challenge,payload=excluded.payload,created_at=now(),expires_at=excluded.expires_at`,
      [flowKey, value.challenge, JSON.stringify({ rpId: value.rpId, origin: value.origin, userAccountId: value.userAccountId || null }), String(ttlSeconds)]
    );
  },
  async consume(flowKey) {
    const result = await dbRequired().query(
      `delete from webauthn_challenges where flow_key=$1 returning challenge,payload,expires_at>now() as live`,
      [flowKey]
    );
    const row = result.rows[0];
    if (!row || !row.live) return null;
    return { challenge: row.challenge, rpId: row.payload?.rpId, origin: row.payload?.origin, userAccountId: row.payload?.userAccountId || null };
  },
};

function challengeStore(): ChallengeStore {
  const redis = getRedis();
  if (!redis) return postgresChallengeStore;
  return {
    async put(flowKey, value, ttlSeconds) {
      try {
        await redis.set(REDIS_PREFIX + flowKey, JSON.stringify(value), "EX", ttlSeconds);
      } catch {
        await postgresChallengeStore.put(flowKey, value, ttlSeconds);
      }
    },
    async consume(flowKey) {
      try {
        // GET and DEL in one MULTI so a challenge can be read only once.
        const results = await redis.multi().get(REDIS_PREFIX + flowKey).del(REDIS_PREFIX + flowKey).exec();
        const raw = results?.[0]?.[1];
        if (typeof raw === "string") return JSON.parse(raw) as StoredChallenge;
      } catch {}
      // Also check the fallback table, in case Redis was down when it was issued.
      return postgresChallengeStore.consume(flowKey);
    },
  };
}

// ---------------------------------------------------------------------------
// Rate limiting (Postgres, same approach as the code sign-in limits).

async function rateLimitCount(bucket: string, windowMinutes: number) {
  const result = await dbRequired().query(
    `select count(*)::int as count from auth_rate_limit_events
      where bucket=$1 and created_at>now()-($2||' minutes')::interval`,
    [bucket, String(windowMinutes)]
  );
  return Number(result.rows[0]?.count || 0);
}

async function recordRateEvent(bucket: string) {
  await dbRequired().query(`insert into auth_rate_limit_events (bucket) values ($1)`, [bucket]);
}

async function takeRateLimit(bucket: string, limit: number, windowMinutes: number) {
  if ((await rateLimitCount(bucket, windowMinutes)) >= limit) {
    throw new PasskeyError("Too many passkey attempts. Try again shortly.", "rate_limited", 429);
  }
  await recordRateEvent(bucket);
}

// ---------------------------------------------------------------------------
// Helpers

function userHandleFor(personId: string) {
  return new Uint8Array(Buffer.from(personId.replace(/-/g, ""), "hex"));
}

function userHandleString(personId: string) {
  return Buffer.from(userHandleFor(personId)).toString("base64url");
}

const KNOWN_TRANSPORTS = new Set(["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"]);

function cleanTransports(value: unknown): AuthenticatorTransportFuture[] {
  if (!Array.isArray(value)) return [];
  return value.filter((t): t is AuthenticatorTransportFuture => typeof t === "string" && KNOWN_TRANSPORTS.has(t)).slice(0, 8);
}

async function sessionCreatedAt(sessionId: string) {
  const result = await dbRequired().query(`select created_at from auth_sessions where id=$1 and revoked_at is null`, [sessionId]);
  return result.rows[0]?.created_at || null;
}

function assertOwnAccount(identity: SessionIdentity) {
  if (identity.supportMode) throw new PasskeyError("Support View cannot manage passkeys", "support_mode", 403);
}

async function assertRecentSignIn(identity: SessionIdentity) {
  if (!signInIsRecent(await sessionCreatedAt(identity.sessionId))) {
    throw new PasskeyError(
      "For your security, sign in again before adding a passkey.",
      "recent_sign_in_required",
      403
    );
  }
}

async function logAuthEvent(input: { userAccountId?: string | null; personId?: string | null; eventType: string; outcome: string; metadata: Record<string, unknown> }) {
  await dbRequired()
    .query(
      `insert into auth_events (user_account_id,person_id,event_type,outcome,metadata) values ($1,$2,$3,$4,$5::jsonb)`,
      [input.userAccountId || null, input.personId || null, input.eventType, input.outcome, JSON.stringify(input.metadata)]
    )
    .catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Availability

export async function passkeyAvailability(request: Request) {
  if (!passkeysFeatureEnabled()) return { enabled: false as const };
  const rp = await relyingPartyForRequest(request);
  if (!rp) return { enabled: false as const };
  return { enabled: true as const, rpId: rp.rpId };
}

// ---------------------------------------------------------------------------
// Registration (signed-in users only)

export async function startPasskeyRegistration(request: Request, identity: SessionIdentity) {
  assertEnabled();
  assertOwnAccount(identity);
  const rp = await requireRelyingParty(request);
  await assertRecentSignIn(identity);
  await takeRateLimit(`passkey-reg:${identity.userAccountId}`, REGISTRATIONS_PER_ACCOUNT, 60);
  const db = dbRequired();

  const existing = await db.query(
    `select credential_id,transports,rp_id from webauthn_credentials where person_id=$1`,
    [identity.personId]
  );
  if ((existing.rowCount || 0) >= PASSKEY_MAX_PER_PERSON) {
    throw new PasskeyError(`You can have up to ${PASSKEY_MAX_PER_PERSON} passkeys. Remove one to add another.`, "too_many_passkeys");
  }
  const email = await db.query(
    `select normalized_email from emails where person_id=$1 and verified_at is not null order by created_at limit 1`,
    [identity.personId]
  );
  const userName = email.rows[0]?.normalized_email || identity.displayName || "BandWagon member";

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rp.rpId,
    userName,
    userDisplayName: identity.displayName || userName,
    userID: userHandleFor(identity.personId),
    attestationType: "none",
    timeout: PASSKEY_CHALLENGE_TTL_SECONDS * 1000,
    excludeCredentials: existing.rows
      .filter((row) => row.rp_id === rp.rpId)
      .map((row) => ({ id: row.credential_id, transports: cleanTransports(row.transports) })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  await challengeStore().put(
    registrationFlowKey(identity.sessionId),
    { challenge: options.challenge, rpId: rp.rpId, origin: rp.origin, userAccountId: identity.userAccountId },
    PASSKEY_CHALLENGE_TTL_SECONDS
  );
  return options;
}

export async function finishPasskeyRegistration(
  request: Request,
  identity: SessionIdentity,
  input: { response: unknown; nickname?: unknown }
) {
  assertEnabled();
  assertOwnAccount(identity);
  const rp = await requireRelyingParty(request);
  const stored = await challengeStore().consume(registrationFlowKey(identity.sessionId));
  if (!challengeMatchesRequest(stored, rp, identity.userAccountId)) {
    throw new PasskeyError("That request expired. Try adding the passkey again.", "challenge_invalid");
  }
  await assertRecentSignIn(identity);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: input.response as RegistrationResponseJSON,
      expectedChallenge: stored!.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpId,
      requireUserVerification: true,
    });
  } catch {
    throw new PasskeyError("We could not verify that passkey. Try again.", "verification_failed");
  }
  if (!verification.verified) throw new PasskeyError("We could not verify that passkey. Try again.", "verification_failed");

  const info = verification.registrationInfo;
  const nickname = cleanPasskeyNickname(input.nickname, defaultPasskeyNickname(request.headers.get("user-agent")));
  const db = dbRequired();
  const client = await db.connect();
  let credentialRowId: string;
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `insert into webauthn_credentials
        (person_id,credential_id,public_key,counter,transports,device_type,backed_up,rp_id,nickname)
       values ($1,$2,$3,$4,$5::text[],$6,$7,$8,$9)
       on conflict (credential_id) do nothing
       returning id`,
      [
        identity.personId,
        info.credential.id,
        Buffer.from(info.credential.publicKey),
        String(info.credential.counter || 0),
        cleanTransports(info.credential.transports),
        info.credentialDeviceType,
        info.credentialBackedUp,
        rp.rpId,
        nickname,
      ]
    );
    if (!inserted.rowCount) throw new PasskeyError("This passkey is already set up.", "duplicate_passkey");
    credentialRowId = inserted.rows[0].id;
    await client.query(
      `insert into audit_events (actor_person_id,action,target_type,target_id,metadata)
       values ($1,'auth.passkey_added','webauthn_credential',$2::text,$3::jsonb)`,
      [identity.personId, credentialRowId, JSON.stringify({ rpId: rp.rpId, host: rp.hostname, deviceType: info.credentialDeviceType, backedUp: info.credentialBackedUp })]
    );
    await client.query(
      `insert into auth_events (user_account_id,person_id,event_type,outcome,metadata) values ($1,$2,'passkey_added','success',$3::jsonb)`,
      [identity.userAccountId, identity.personId, JSON.stringify({ credentialRowId, rpId: rp.rpId, requestIpHash: requestIpHash(requestIp(request)) })]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  await notifyPasskeyAdded(identity, nickname, rp).catch(() => undefined);
  return { id: credentialRowId, nickname, rpId: rp.rpId };
}

async function notifyPasskeyAdded(identity: SessionIdentity, nickname: string, rp: PasskeyRelyingParty) {
  const email = await dbRequired().query(
    `select normalized_email from emails where person_id=$1 and verified_at is not null order by created_at limit 1`,
    [identity.personId]
  );
  const to = email.rows[0]?.normalized_email;
  if (!to) return;
  await sendEmailNotification({
    to,
    subject: "A passkey was added to your BandWagon account",
    body: [
      `A new passkey named "${nickname}" was added to your BandWagon account on ${rp.hostname}.`,
      "You can now sign in with your face, fingerprint, or screen lock on that device.",
      "",
      "If you did not do this, go to Settings, then Security, remove the passkey, and contact BandWagon support.",
    ].join("\n"),
    personId: identity.personId,
    notificationType: "security_passkey_added",
    urgency: "important",
  });
}

// ---------------------------------------------------------------------------
// Management

export async function listPasskeys(identity: SessionIdentity, rp: PasskeyRelyingParty | null) {
  const result = await dbRequired().query(
    `select id,nickname,rp_id,device_type,backed_up,created_at,last_used_at
       from webauthn_credentials where person_id=$1 order by created_at desc`,
    [identity.personId]
  );
  return result.rows.map((row) => ({
    id: row.id as string,
    nickname: row.nickname as string,
    rpId: row.rp_id as string,
    synced: row.device_type === "multiDevice" || row.backed_up === true,
    createdAt: new Date(row.created_at).toISOString(),
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
    worksHere: Boolean(rp && rp.rpId === row.rp_id),
  }));
}

function assertUuid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new PasskeyError("Passkey not found", "not_found", 404);
}

export async function renamePasskey(identity: SessionIdentity, id: string, nickname: unknown) {
  assertEnabled();
  assertOwnAccount(identity);
  assertUuid(id);
  const name = cleanPasskeyNickname(nickname, "");
  if (!name) throw new PasskeyError("Enter a name for this passkey", "invalid_name");
  const db = dbRequired();
  const result = await db.query(
    `update webauthn_credentials set nickname=$1 where id=$2 and person_id=$3 returning id`,
    [name, id, identity.personId]
  );
  if (!result.rowCount) throw new PasskeyError("Passkey not found", "not_found", 404);
  await db.query(
    `insert into audit_events (actor_person_id,action,target_type,target_id,metadata)
     values ($1,'auth.passkey_renamed','webauthn_credential',$2::text,$3::jsonb)`,
    [identity.personId, id, JSON.stringify({})]
  );
  return { id, nickname: name };
}

/** Removing a passkey is always allowed (even if disabled) so users can clean up. */
export async function removePasskey(request: Request, identity: SessionIdentity, id: string) {
  assertOwnAccount(identity);
  assertUuid(id);
  const db = dbRequired();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const removed = await client.query(
      `delete from webauthn_credentials where id=$1 and person_id=$2 returning rp_id,nickname`,
      [id, identity.personId]
    );
    if (!removed.rowCount) throw new PasskeyError("Passkey not found", "not_found", 404);
    await client.query(
      `insert into audit_events (actor_person_id,action,target_type,target_id,metadata)
       values ($1,'auth.passkey_removed','webauthn_credential',$2::text,$3::jsonb)`,
      [identity.personId, id, JSON.stringify({ rpId: removed.rows[0].rp_id })]
    );
    await client.query(
      `insert into auth_events (user_account_id,person_id,event_type,outcome,metadata) values ($1,$2,'passkey_removed','success',$3::jsonb)`,
      [identity.userAccountId, identity.personId, JSON.stringify({ credentialRowId: id, requestIpHash: requestIpHash(requestIp(request)) })]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Sign-in

export async function startPasskeySignIn(request: Request) {
  assertEnabled();
  const rp = await requireRelyingParty(request);
  const ipHash = requestIpHash(requestIp(request));
  if (ipHash) await takeRateLimit(`passkey-auth-ip:${ipHash}`, AUTH_OPTIONS_PER_IP, 15);
  const options = await generateAuthenticationOptions({
    rpID: rp.rpId,
    userVerification: "required",
    timeout: PASSKEY_CHALLENGE_TTL_SECONDS * 1000,
    // Discoverable credentials: the browser offers the passkeys it holds for this rpId.
    allowCredentials: [],
  });
  const flowId = crypto.randomBytes(32).toString("base64url");
  await challengeStore().put(
    authenticationFlowKey(flowId),
    { challenge: options.challenge, rpId: rp.rpId, origin: rp.origin, userAccountId: null },
    PASSKEY_CHALLENGE_TTL_SECONDS
  );
  return { options, flowId };
}

export async function finishPasskeySignIn(
  request: Request,
  input: { flowId: unknown; response: unknown; userAgent?: string | null }
) {
  assertEnabled();
  const ip = requestIp(request);
  const ipHash = requestIpHash(ip);
  if (ipHash && (await rateLimitCount(`passkey-auth-fail:${ipHash}`, 15)) >= AUTH_FAILURES_PER_IP) {
    throw new PasskeyError("Too many passkey attempts. Try again shortly.", "rate_limited", 429);
  }
  const rp = await requireRelyingParty(request);

  let personId: string | null = null;
  const fail = async (reason: string): Promise<never> => {
    if (ipHash) await recordRateEvent(`passkey-auth-fail:${ipHash}`).catch(() => undefined);
    await logAuthEvent({ personId, eventType: "passkey_sign_in_failed", outcome: "failed", metadata: { reason, rpId: rp.rpId, requestIpHash: ipHash } });
    throw new PasskeyError(SIGN_IN_FAILED, "sign_in_failed", 400);
  };

  if (!isValidFlowId(input.flowId)) return fail("missing_flow");
  const stored = await challengeStore().consume(authenticationFlowKey(input.flowId));
  if (!challengeMatchesRequest(stored, rp)) return fail("challenge_invalid");

  const response = input.response as AuthenticationResponseJSON;
  if (!response || typeof response.id !== "string") return fail("malformed_response");
  const db = dbRequired();
  const found = await db.query(
    `select id,person_id,credential_id,public_key,counter,transports,rp_id from webauthn_credentials where credential_id=$1`,
    [response.id]
  );
  const credential = found.rows[0];
  // Only a passkey created for this host's rpId can sign in here.
  if (!credential || credential.rp_id !== rp.rpId) return fail("unknown_credential");
  personId = credential.person_id;
  const handle = response.response?.userHandle;
  if (handle && handle !== userHandleString(credential.person_id)) return fail("user_handle_mismatch");

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: stored!.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpId,
      requireUserVerification: true,
      credential: {
        id: credential.credential_id,
        publicKey: new Uint8Array(credential.public_key),
        counter: Number(credential.counter || 0),
        transports: cleanTransports(credential.transports),
      },
    });
  } catch {
    return fail("verification_error");
  }
  if (!verification.verified) return fail("not_verified");

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    // Same account restrictions as code sign-in (active person and account,
    // guardian rules for managed students).
    const account = await findSignInEligibleAccount(client, credential.person_id);
    if (!account) {
      await client.query("ROLLBACK");
      return fail("account_restricted");
    }
    const info = verification.authenticationInfo;
    await client.query(
      `update webauthn_credentials
          set counter=greatest(counter,$1::bigint),last_used_at=now(),backed_up=$2,device_type=$3
        where id=$4`,
      [String(info.newCounter || 0), info.credentialBackedUp, info.credentialDeviceType, credential.id]
    );
    const session = await completeSignIn(client, {
      userAccountId: account.user_account_id,
      personId: account.person_id,
      eventType: "passkey_sign_in",
      metadata: { credentialRowId: credential.id, rpId: rp.rpId, requestIpHash: ipHash },
      requestIp: ip,
      userAgent: input.userAgent,
    });
    await client.query(
      `insert into audit_events (actor_person_id,action,target_type,target_id,metadata)
       values ($1,'auth.passkey_sign_in','webauthn_credential',$2::text,$3::jsonb)`,
      [account.person_id, credential.id, JSON.stringify({ rpId: rp.rpId, host: rp.hostname })]
    );
    await client.query("COMMIT");
    return { ...session, personId: account.person_id, userAccountId: account.user_account_id };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Everything the Security settings page needs in one call. */
export async function passkeyManagementStatus(request: Request, identity: SessionIdentity) {
  const enabled = passkeysFeatureEnabled();
  const rp = enabled ? await relyingPartyForRequest(request) : null;
  const passkeys = await listPasskeys(identity, rp);
  const recentSignIn = identity.supportMode ? false : signInIsRecent(await sessionCreatedAt(identity.sessionId));
  return {
    enabled: Boolean(enabled && rp),
    rpId: rp?.rpId || null,
    recentSignIn,
    supportMode: Boolean(identity.supportMode),
    passkeys,
  };
}
