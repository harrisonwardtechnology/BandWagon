import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  createPrivacyPreferences,
  parsePrivacyPreferences,
  PRIVACY_CONSENT_VERSION,
  privacyPreferencesFromCookieHeader,
  serializePrivacyPreferences,
} from "../src/lib/consent-policy.ts";

test("privacy preferences round trip with a timestamp and current policy version", () => {
  const decidedAt = new Date("2026-08-26T12:00:00.000Z");
  const preferences = createPrivacyPreferences(true, decidedAt);
  assert.deepEqual(parsePrivacyPreferences(serializePrivacyPreferences(preferences)), preferences);
  assert.equal(preferences.version, PRIVACY_CONSENT_VERSION);
});

test("invalid and outdated privacy preferences require a new choice", () => {
  assert.equal(parsePrivacyPreferences(""), null);
  assert.equal(parsePrivacyPreferences("v=old&f=1&t=2026-08-26T12%3A00%3A00.000Z"), null);
  assert.equal(parsePrivacyPreferences(`v=${PRIVACY_CONSENT_VERSION}&f=maybe&t=bad`), null);
});

test("privacy preferences are found without confusing another cookie", () => {
  const value = serializePrivacyPreferences(createPrivacyPreferences(false, new Date("2026-08-26T12:00:00.000Z")));
  const result = privacyPreferencesFromCookieHeader(`bw_session=secret; bw_privacy_preferences=${encodeURIComponent(value)}; other=1`);
  assert.equal(result?.functional, false);
});

test("consent UI offers accept, reject, manage, and does not pre-authorize tracking", () => {
  const component = fs.readFileSync("src/components/privacy-consent-manager.tsx", "utf8");
  const policy = fs.readFileSync("src/app/cookies/page.tsx", "utf8");
  const pwa = fs.readFileSync("src/app/PwaRegister.tsx", "utf8");
  assert.match(component, /Accept optional/);
  assert.match(component, /Reject optional/);
  assert.match(component, /Manage preferences/);
  assert.match(component, /Analytics[\s\S]*Not used/);
  assert.match(component, /Advertising[\s\S]*Not used/);
  assert.match(policy, /will not add optional analytics or advertising technology under an existing functional-storage choice/i);
  assert.match(pwa, /privacyPreferencesFromCookieHeader/);
  assert.match(pwa, /if \(functional\)/);
  assert.match(pwa, /removeUnusedWorkerAndCache/);
});
