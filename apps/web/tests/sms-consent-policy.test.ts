import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { classifyInboundConsent, mobileSendDecision, SMS_CONSENT_TEXT } from "../src/lib/sms-consent-policy.ts";

test("Twilio Advanced Opt-Out type wins when present", () => {
  assert.equal(classifyInboundConsent({ optOutType: "STOP", body: "hello" }), "opt_out");
  assert.equal(classifyInboundConsent({ optOutType: "start", body: "" }), "opt_in");
  assert.equal(classifyInboundConsent({ optOutType: "HELP", body: "STOP" }), null);
});

test("Keyword fallback catches STOP when Advanced Opt-Out is not configured", () => {
  for (const body of ["STOP", "stop", " Stop. ", "unsubscribe", "CANCEL", "end", "quit", "STOPALL"]) {
    assert.equal(classifyInboundConsent({ body }), "opt_out", body);
  }
  for (const body of ["START", "yes", "unstop"]) {
    assert.equal(classifyInboundConsent({ body }), "opt_in", body);
  }
  assert.equal(classifyInboundConsent({ body: "please stop by at 5" }), null);
  assert.equal(classifyInboundConsent({ body: "CONFIRM ABC123" }), null);
});

test("Ride texts need an affirmative opt-in; verifying a number is not enough", () => {
  assert.deepEqual(mobileSendDecision({ notificationType: "ride_matched", phoneState: "opted_in" }), { allowed: true });
  assert.equal(mobileSendDecision({ notificationType: "ride_matched", phoneState: "not_configured" }).allowed, false);
  assert.equal(mobileSendDecision({ notificationType: "ride_matched", phoneState: null }).allowed, false);
});

test("A carrier-level STOP blocks everything, including codes", () => {
  assert.equal(mobileSendDecision({ notificationType: "otp", registryState: "opted_out" }).allowed, false);
  assert.equal(mobileSendDecision({ notificationType: "ride_matched", phoneState: "opted_in", registryState: "opted_out" }).allowed, false);
  assert.equal(mobileSendDecision({ notificationType: "otp", phoneState: "opted_out" }).allowed, false);
});

test("Requested verification codes do not need ride-text consent", () => {
  assert.deepEqual(mobileSendDecision({ notificationType: "otp", phoneState: null, registryState: null }), { allowed: true });
});

test("Consent text carries the carrier-required disclosures", () => {
  assert.match(SMS_CONSENT_TEXT, /Message frequency varies/);
  assert.match(SMS_CONSENT_TEXT, /Message and data rates may apply/);
  assert.match(SMS_CONSENT_TEXT, /Reply STOP to opt out/);
  assert.match(SMS_CONSENT_TEXT, /HELP/);
});

test("Signup checkbox is unchecked by default and shares the public consent text", async () => {
  const login = await readFile(new URL("../src/app/login/page.tsx", import.meta.url), "utf8");
  assert.match(login, /useState\(false\)[\s\S]*SMS_CONSENT_TEXT/);
  assert.match(login, /smsConsent:contactMethod==="phone"&&smsConsent/);
  const publicPage = await readFile(new URL("../src/app/sms-opt-in/page.tsx", import.meta.url), "utf8");
  assert.match(publicPage, /\{SMS_CONSENT_TEXT\}/);
});

test("Inbound webhook records consent before the dedupe marker and fails loudly", async () => {
  const route = await readFile(new URL("../src/app/api/webhooks/twilio/inbound/route.ts", import.meta.url), "utf8");
  assert.ok(route.indexOf("recordSmsConsent(") < route.indexOf("markOnce("), "consent must be written before markOnce");
  assert.match(route, /status: 500/);
});

test("Send path no longer skips consent when LOOKUP_HASH_KEY is unset", async () => {
  const send = await readFile(new URL("../src/lib/twilio-send.ts", import.meta.url), "utf8");
  assert.doesNotMatch(send, /if \(process\.env\.LOOKUP_HASH_KEY\)/);
  assert.match(send, /sms_opt_outs/);
});

test("Welcome text carries brand, frequency, rates, HELP/STOP and a support contact", async () => {
  const { SMS_WELCOME_TEXT, SMS_HELP_TEXT } = await import("../src/lib/sms-consent-policy.ts");
  for (const text of [SMS_WELCOME_TEXT, SMS_HELP_TEXT]) {
    assert.match(text, /BandWagon/);
    assert.match(text, /frequency varies/i);
    assert.match(text, /Msg & data rates may apply/);
    assert.match(text, /STOP/);
    assert.match(text, /support@bandwagon\.club/);
  }
  assert.match(SMS_WELCOME_TEXT, /HELP/);
  assert.ok(SMS_WELCOME_TEXT.length <= 306, "welcome text should fit in two SMS segments");
});

test("Every SMS opt-in shows Terms and Privacy links and sends one welcome text", async () => {
  for (const file of ["../src/app/login/page.tsx", "../src/app/notifications/page.tsx", "../src/app/sms-opt-in/page.tsx"]) {
    const src = await readFile(new URL(file, import.meta.url), "utf8");
    assert.match(src, /href="\/terms"/, file);
    assert.match(src, /href="\/privacy"/, file);
  }
  const optIn = await readFile(new URL("../src/app/sms-opt-in/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(optIn, /disabled/);
  const auth = await readFile(new URL("../src/lib/auth-service.ts", import.meta.url), "utf8");
  assert.match(auth, /COMMIT"\);\s*if \(smsWelcome\) void sendSmsWelcome/);
  const route = await readFile(new URL("../src/app/api/sms-consent/route.ts", import.meta.url), "utf8");
  assert.match(route, /if \(consent\.newlyOptedIn\) void sendSmsWelcome/);
});

test("Sign-in code request has its own carrier disclosure, an email alternative, and a separate ride-text box", async () => {
  const { SMS_OTP_DISCLOSURE_TEXT, OTP_SEND_BUTTON_LABEL, SMS_CONSENT_TEXT: consent } = await import("../src/lib/sms-consent-policy.ts");
  assert.equal(SMS_OTP_DISCLOSURE_TEXT, "By clicking Send Sign-In Code, you agree to receive a one-time verification passcode via text message from BandWagon. Message and data rates may apply.");
  assert.equal(OTP_SEND_BUTTON_LABEL, "Send Sign-In Code");
  assert.match(consent, /Sign-in codes are separate/);
  assert.doesNotMatch(consent, /account activity/);
  const login = await readFile(new URL("../src/app/login/page.tsx", import.meta.url), "utf8");
  assert.match(login, /contactMethod==="phone" && <p className="otp-disclosure"[^>]*>\{SMS_OTP_DISCLOSURE_TEXT\}/);
  assert.match(login, /Get Your Code By Email Instead/);
  assert.match(login, /Optional: Ride Update Texts/);
  assert.match(login, /useState\(false\)[\s\S]*SMS_CONSENT_TEXT/);
});
