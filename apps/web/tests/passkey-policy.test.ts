import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  PASSKEY_EXPLAINER,
  authenticationFlowKey,
  challengeMatchesRequest,
  cleanPasskeyNickname,
  createMemoryChallengeStore,
  defaultPasskeyNickname,
  isValidFlowId,
  parseHostHeader,
  passkeysEnabled,
  registrationFlowKey,
  requestOriginAllowed,
  resolvePasskeyRelyingParty,
  safeNextPath,
  signInIsRecent,
  type PasskeyHostConfig,
} from "../src/lib/passkey-policy.ts";

const config: PasskeyHostConfig = {
  platformHosts: ["bandwagon.club", "www.bandwagon.club"],
  tenantBase: "bandwagon.club",
  legacyPlatformHosts: ["bandwagon.harrisonward.net"],
  legacyTenantBases: ["harrisonward.org"],
  production: true,
};

test("platform hosts use bandwagon.club as the RP ID", () => {
  assert.deepEqual(resolvePasskeyRelyingParty("bandwagon.club", config, false), {
    rpId: "bandwagon.club", origin: "https://bandwagon.club", hostname: "bandwagon.club", kind: "platform",
  });
  const www = resolvePasskeyRelyingParty("WWW.bandwagon.club:443", config, false);
  assert.equal(www?.rpId, "bandwagon.club");
  assert.equal(www?.origin, "https://www.bandwagon.club");
});

test("community subdomains share the bandwagon.club RP ID", () => {
  const rp = resolvePasskeyRelyingParty("flomo.bandwagon.club", config, true);
  assert.deepEqual(rp, { rpId: "bandwagon.club", origin: "https://flomo.bandwagon.club", hostname: "flomo.bandwagon.club", kind: "tenant" });
});

test("custom domains use their own hostname as the RP ID", () => {
  const rp = resolvePasskeyRelyingParty("flomogo.app", config, true);
  assert.deepEqual(rp, { rpId: "flomogo.app", origin: "https://flomogo.app", hostname: "flomogo.app", kind: "custom_domain" });
});

test("unknown hosts get no relying party", () => {
  // Not an active organization domain in the database.
  assert.equal(resolvePasskeyRelyingParty("evil.example", config, false), null);
  assert.equal(resolvePasskeyRelyingParty("unknown.bandwagon.club", config, false), null);
  // Tenant hostnames are one label deep, even if something claims to know them.
  assert.equal(resolvePasskeyRelyingParty("a.b.bandwagon.club", config, true), null);
  // Legacy redirect-only hosts never get passkeys.
  assert.equal(resolvePasskeyRelyingParty("bandwagon.harrisonward.net", config, true), null);
  assert.equal(resolvePasskeyRelyingParty("flomo.harrisonward.org", config, true), null);
  // Malformed or non-default ports.
  assert.equal(resolvePasskeyRelyingParty("", config, true), null);
  assert.equal(resolvePasskeyRelyingParty("bandwagon.club:8443", config, false), null);
  assert.equal(resolvePasskeyRelyingParty("user@bandwagon.club", config, false), null);
  assert.equal(resolvePasskeyRelyingParty("bandwagon.club/evil", config, false), null);
});

test("localhost works only outside production", () => {
  assert.equal(resolvePasskeyRelyingParty("localhost:3000", config, false), null);
  const dev = resolvePasskeyRelyingParty("localhost:3000", { ...config, production: false }, false);
  assert.deepEqual(dev, { rpId: "localhost", origin: "http://localhost:3000", hostname: "localhost", kind: "local" });
});

test("host header parsing is strict", () => {
  assert.deepEqual(parseHostHeader("Flomogo.App."), { hostname: "flomogo.app", port: null });
  assert.equal(parseHostHeader("bad host"), null);
  assert.equal(parseHostHeader(null), null);
});

test("origin validation rejects unknown or mismatched origins", () => {
  const rp = resolvePasskeyRelyingParty("flomo.bandwagon.club", config, true);
  assert.equal(requestOriginAllowed("https://flomo.bandwagon.club", rp), true);
  assert.equal(requestOriginAllowed("https://evil.example", rp), false);
  assert.equal(requestOriginAllowed("https://bandwagon.club", rp), false);
  assert.equal(requestOriginAllowed("http://flomo.bandwagon.club", rp), false);
  assert.equal(requestOriginAllowed("null", rp), false);
  assert.equal(requestOriginAllowed(null, rp), false);
  assert.equal(requestOriginAllowed("not a url", rp), false);
  const unknown = resolvePasskeyRelyingParty("evil.example", config, false);
  assert.equal(requestOriginAllowed("https://evil.example", unknown), false);
});

test("challenges are single use and bound to the flow", async () => {
  let now = 1_000_000;
  const store = createMemoryChallengeStore(() => now);
  const rp = resolvePasskeyRelyingParty("bandwagon.club", config, false)!;
  const key = authenticationFlowKey("a".repeat(43));
  await store.put(key, { challenge: "c1", rpId: rp.rpId, origin: rp.origin }, 300);
  assert.equal(await store.consume(authenticationFlowKey("b".repeat(43))), null);
  const first = await store.consume(key);
  assert.equal(first?.challenge, "c1");
  assert.equal(challengeMatchesRequest(first, rp), true);
  assert.equal(await store.consume(key), null, "second use must fail");

  await store.put(key, { challenge: "c2", rpId: rp.rpId, origin: rp.origin }, 300);
  now += 301_000;
  assert.equal(await store.consume(key), null, "expired challenge must fail");
});

test("a challenge cannot be finished on another host or by another account", () => {
  const platform = resolvePasskeyRelyingParty("bandwagon.club", config, false)!;
  const tenant = resolvePasskeyRelyingParty("flomo.bandwagon.club", config, true)!;
  const custom = resolvePasskeyRelyingParty("flomogo.app", config, true)!;
  const stored = { challenge: "c", rpId: platform.rpId, origin: platform.origin, userAccountId: "acct-1" };
  assert.equal(challengeMatchesRequest(stored, tenant), false, "same rpId but different origin");
  assert.equal(challengeMatchesRequest(stored, custom), false);
  assert.equal(challengeMatchesRequest(stored, platform, "acct-2"), false);
  assert.equal(challengeMatchesRequest(stored, platform, "acct-1"), true);
  assert.equal(challengeMatchesRequest(null, platform), false);
  assert.notEqual(registrationFlowKey("s1"), authenticationFlowKey("s1"));
});

test("flow IDs must look like server-issued random tokens", () => {
  assert.equal(isValidFlowId("A".repeat(43)), true);
  assert.equal(isValidFlowId("short"), false);
  assert.equal(isValidFlowId("x".repeat(40) + "';--"), false);
  assert.equal(isValidFlowId(undefined), false);
});

test("adding a passkey requires a sign-in within ten minutes", () => {
  const now = Date.parse("2026-09-27T12:00:00Z");
  assert.equal(signInIsRecent(new Date(now - 5 * 60_000), now), true);
  assert.equal(signInIsRecent(new Date(now - 11 * 60_000), now), false);
  assert.equal(signInIsRecent(null, now), false);
  assert.equal(signInIsRecent("not a date", now), false);
});

test("PASSKEYS_ENABLED defaults on and can be turned off", () => {
  assert.equal(passkeysEnabled(undefined), true);
  assert.equal(passkeysEnabled(""), true);
  assert.equal(passkeysEnabled("true"), true);
  for (const off of ["false", "0", "off", "NO"]) assert.equal(passkeysEnabled(off), false);
});

test("passkey names are cleaned and bounded", () => {
  assert.equal(cleanPasskeyNickname("  My\u0000  iPhone \n"), "My iPhone");
  assert.equal(cleanPasskeyNickname("", "Mac"), "Mac");
  assert.equal(cleanPasskeyNickname("x".repeat(100)).length, 60);
  assert.equal(defaultPasskeyNickname("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"), "iPhone");
  assert.equal(defaultPasskeyNickname(null), "Passkey");
});

test("post sign-in redirects stay inside the app", () => {
  assert.equal(safeNextPath("/app/settings/security"), "/app/settings/security");
  assert.equal(safeNextPath("https://evil.example"), "/app");
  assert.equal(safeNextPath("//evil.example"), "/app");
  assert.equal(safeNextPath("/login"), "/app");
  assert.equal(safeNextPath(null), "/app");
});

test("passkey UI copy is plain and has no em dashes", () => {
  assert.equal(PASSKEY_EXPLAINER, "Sign in with your face, fingerprint, or screen lock.");
  for (const file of [
    "../src/app/login/page.tsx",
    "../src/app/app/settings/security/page.tsx",
    "../src/lib/passkeys.ts",
    "../src/lib/passkey-policy.ts",
  ]) {
    const source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
    assert.equal(source.includes("—"), false, `${file} contains an em dash`);
  }
});

test("passkey sign-in reuses the shared post-auth path and account rules", () => {
  const service = fs.readFileSync(new URL("../src/lib/auth-service.ts", import.meta.url), "utf8");
  const passkeys = fs.readFileSync(new URL("../src/lib/passkeys.ts", import.meta.url), "utf8");
  assert.match(service, /export async function completeSignIn/);
  assert.match(service, /const session = await completeSignIn\(client/);
  assert.match(passkeys, /findSignInEligibleAccount\(client/);
  assert.match(passkeys, /completeSignIn\(client/);
  assert.match(passkeys, /credential\.rp_id !== rp\.rpId/);
  const migration = fs.readFileSync(new URL("../database/migrations/058_passkeys.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS webauthn_credentials/);
  assert.match(migration, /credential_id text NOT NULL UNIQUE/);
});

test("managed student passkeys are tied to the guardian-authorized login email", () => {
  const read = (file: string) => fs.readFileSync(new URL(file, import.meta.url), "utf8");
  const service = read("../src/lib/auth-service.ts");
  const passkeys = read("../src/lib/passkeys.ts");
  const onboarding = read("../src/lib/onboarding.ts");

  // Sign-in: the credential's recorded login email must still be the authorized one.
  const eligibility = service.slice(service.indexOf("export async function findSignInEligibleAccount"));
  assert.match(eligibility, /credentialLoginEmailId: string \| null/);
  assert.match(eligibility, /msa\.login_email_id=\$2::uuid/);
  assert.match(passkeys, /findSignInEligibleAccount\(client, credential\.person_id, locked\.rows\[0\]\.login_email_id \|\| null\)/);
  assert.match(passkeys, /select login_email_id from webauthn_credentials where id=\$1 for update/);

  // Registration records the authorized login email for managed students.
  assert.match(passkeys, /managedStudentLoginEmailId\(client, identity\.personId\)/);
  assert.match(passkeys, /rp_id,nickname,login_email_id\)/);

  // Guardian changes: disabling sign-in or switching the login email removes passkeys.
  assert.match(onboarding, /delete from webauthn_credentials\s+where person_id=\$1 and \(\$2::boolean=false or login_email_id is distinct from \$3::uuid\)/);
  assert.match(onboarding, /delete from webauthn_credentials where person_id=\$1`,\[input\.studentPersonId\]/);

  // Schema change ships in a new migration; 058 stays as released.
  const m058 = read("../database/migrations/058_passkeys.sql");
  const m062 = read("../database/migrations/062_passkey_login_email.sql");
  assert.equal(m058.includes("login_email_id"), false);
  assert.match(m062, /ADD COLUMN IF NOT EXISTS login_email_id uuid REFERENCES emails\(id\) ON DELETE CASCADE/);
  assert.match(read("../scripts/verify-schema.mjs"), /webauthn_credentials\.login_email_id is missing/);
});
