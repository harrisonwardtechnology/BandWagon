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

test("A web opt-in never clears a carrier STOP", async () => {
  const { isCarrierStop, webOptInBlockedByCarrierStop } = await import("../src/lib/sms-consent-policy.ts");
  for (const registrySource of ["carrier_keyword", "twilio_advanced_opt_out", "migrated_phone_status"]) {
    assert.equal(isCarrierStop({ registryState: "opted_out", registrySource }), true, registrySource);
    for (const source of ["settings", "signup_checkbox"] as const) {
      assert.equal(webOptInBlockedByCarrierStop({ action: "opt_in", source, registryState: "opted_out", registrySource }), true, `${source} after ${registrySource}`);
    }
  }
  // An opt-out made on the settings page is ours to undo.
  assert.equal(isCarrierStop({ registryState: "opted_out", registrySource: "settings" }), false);
  assert.equal(webOptInBlockedByCarrierStop({ action: "opt_in", source: "settings", registryState: "opted_out", registrySource: "settings" }), false);
  // No registry row, or already opted in: nothing to block.
  assert.equal(webOptInBlockedByCarrierStop({ action: "opt_in", source: "settings", registryState: null, registrySource: null }), false);
  assert.equal(webOptInBlockedByCarrierStop({ action: "opt_in", source: "signup_checkbox", registryState: "opted_in", registrySource: "carrier_keyword" }), false);
  // A carrier START is how the STOP gets cleared, and opting out is always allowed.
  assert.equal(webOptInBlockedByCarrierStop({ action: "opt_in", source: "carrier_keyword", registryState: "opted_out", registrySource: "carrier_keyword" }), false);
  assert.equal(webOptInBlockedByCarrierStop({ action: "opt_in", source: "twilio_advanced_opt_out", registryState: "opted_out", registrySource: "twilio_advanced_opt_out" }), false);
  assert.equal(webOptInBlockedByCarrierStop({ action: "opt_out", source: "settings", registryState: "opted_out", registrySource: "carrier_keyword" }), false);
});

test("The carrier STOP message tells the person to text START", async () => {
  const { smsCarrierStopMessage } = await import("../src/lib/sms-consent-policy.ts");
  assert.equal(smsCarrierStopMessage("(469) 555-0100"), "Texts to this number are still blocked because it replied STOP. Text START to (469) 555-0100 to turn them back on. Then refresh this page.");
  assert.match(smsCarrierStopMessage(null), /Reply START to any BandWagon text/);
  assert.match(smsCarrierStopMessage(), /replied STOP/);
});

test("recordSmsConsent checks the opt-out registry before writing or sending a welcome text", async () => {
  const lib = await readFile(new URL("../src/lib/sms-consent.ts", import.meta.url), "utf8");
  const check = lib.indexOf("webOptInBlockedByCarrierStop({");
  const blocked = lib.indexOf("return { newlyOptedIn: false, phone: e164, carrierStop: true }", check);
  const registryWrite = lib.indexOf("insert into sms_opt_outs");
  const phoneWrite = lib.indexOf("update phones set messaging_consent_status='opted_in'");
  const eventWrite = lib.indexOf("insert into sms_consent_events");
  assert.ok(check > 0 && blocked > check, "the carrier STOP check returns early");
  assert.ok(blocked < registryWrite && blocked < phoneWrite && blocked < eventWrite, "nothing is written when a carrier STOP is in force");
  assert.match(lib, /r\.source as registry_source/);
  // The same guard is in the write itself, so a STOP that lands mid-request is not cleared either.
  assert.match(lib, /where not \(\$4::boolean and sms_opt_outs\.state='opted_out' and sms_opt_outs\.source<>'settings'\)/);
  assert.match(lib, /if \(!written\.rowCount\) return \{ newlyOptedIn: false, phone: e164, carrierStop: true \}/);
  // A settings opt-out on top of a carrier STOP keeps the carrier source.
  assert.match(lib, /then sms_opt_outs\.source else excluded\.source end/);

  const route = await readFile(new URL("../src/app/api/sms-consent/route.ts", import.meta.url), "utf8");
  const stop = route.indexOf("if (consent.carrierStop)");
  assert.ok(stop > 0 && stop < route.indexOf("if (consent.newlyOptedIn) void sendSmsWelcome"), "the START message comes before any welcome text");
  assert.match(route, /smsCarrierStopMessage\(sender\)/);
  assert.match(route, /status: 409/);

  const auth = await readFile(new URL("../src/lib/auth-service.ts", import.meta.url), "utf8");
  assert.match(auth, /smsOptInBlocked = consent\.carrierStop;/);
});

test("Every phone row lookup uses the one shared ordering rule", async () => {
  const { verifiedPhoneOrderBy } = await import("../src/lib/sms-consent-policy.ts");
  assert.equal(verifiedPhoneOrderBy(), "verified_at desc, created_at desc, id desc");
  assert.equal(verifiedPhoneOrderBy("p"), "p.verified_at desc, p.created_at desc, p.id desc");
  assert.throws(() => verifiedPhoneOrderBy("p; select 1"), /Invalid SQL alias/);

  const send = await readFile(new URL("../src/lib/twilio-send.ts", import.meta.url), "utf8");
  assert.match(send, /from phones\s+where lookup_hash=\$1 and verified_at is not null\s+order by \$\{verifiedPhoneOrderBy\(\)\} limit 1/);
  const consent = await readFile(new URL("../src/lib/sms-consent.ts", import.meta.url), "utf8");
  assert.equal(consent.match(/order by \$\{verifiedPhoneOrderBy\((?:"p")?\)\} limit 1/g)?.length, 2, "getSmsConsentStatus and getAnyVerifiedPhone");
  const accounts = await readFile(new URL("../src/lib/accounts.ts", import.meta.url), "utf8");
  assert.match(accounts, /order by \$\{verifiedPhoneOrderBy\("p"\)\} limit 1/);
  // No hand-written ordering is left on a phone lookup that picks one row.
  for (const [name, src] of [["twilio-send", send], ["sms-consent", consent], ["accounts", accounts]] as const) {
    assert.doesNotMatch(src, /order by (p\.)?(created_at|verified_at) desc limit 1/, name);
  }
});
