import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  isMessagingSandboxEnabled,
  parseSandboxAllowlist,
  sandboxDeliveryDecision,
  SANDBOX_SKIPPED_STATUS,
} from "../src/lib/messaging-sandbox-policy.ts";

test("sandbox is off by default and on when MESSAGING_SANDBOX is truthy", () => {
  assert.equal(isMessagingSandboxEnabled({}), false);
  assert.equal(isMessagingSandboxEnabled({ MESSAGING_SANDBOX: "false" }), false);
  assert.equal(isMessagingSandboxEnabled({ MESSAGING_SANDBOX: "true" }), true);
  assert.equal(isMessagingSandboxEnabled({ MESSAGING_SANDBOX: " TRUE " }), true);
  assert.equal(isMessagingSandboxEnabled({ MESSAGING_SANDBOX: "1" }), true);
});

test("staging forces the sandbox on even when the flag says false", () => {
  assert.equal(isMessagingSandboxEnabled({ NEXT_PUBLIC_ENVIRONMENT: "staging", MESSAGING_SANDBOX: "false" }), true);
  assert.equal(isMessagingSandboxEnabled({ APP_ENVIRONMENT: "Staging" }), true);
  assert.equal(isMessagingSandboxEnabled({ NEXT_PUBLIC_ENVIRONMENT: "production" }), false);
});

test("allowlists normalize phones and emails and drop junk", () => {
  const phones = parseSandboxAllowlist(" +1 (972) 555-0100, +19725550101 ,not-a-phone,,5550102", "sms");
  assert.deepEqual([...phones].sort(), ["+19725550100", "+19725550101"]);
  const emails = parseSandboxAllowlist("Tester@Example.com; qa@example.com\nbad", "email");
  assert.deepEqual([...emails].sort(), ["qa@example.com", "tester@example.com"]);
  assert.equal(parseSandboxAllowlist(undefined, "sms").size, 0);
});

test("production sends to anyone", () => {
  assert.deepEqual(sandboxDeliveryDecision({ channel: "sms", to: "+19725550199", env: {} }), { sandbox: false, send: true });
  assert.deepEqual(sandboxDeliveryDecision({ channel: "email", to: "family@example.com", env: {} }), { sandbox: false, send: true });
});

test("sandbox sends only to allowlisted recipients", () => {
  const env = { MESSAGING_SANDBOX: "true", SANDBOX_ALLOWED_PHONES: "+19725550100", SANDBOX_ALLOWED_EMAILS: "qa@example.com" };
  assert.deepEqual(sandboxDeliveryDecision({ channel: "sms", to: "+19725550100", env }), { sandbox: true, send: true });
  assert.deepEqual(sandboxDeliveryDecision({ channel: "email", to: "QA@Example.com", env }), { sandbox: true, send: true });

  const phone = sandboxDeliveryDecision({ channel: "sms", to: "+19725550199", env });
  assert.equal(phone.send, false);
  assert.match(phone.send ? "" : phone.reason, /SANDBOX_ALLOWED_PHONES/);

  const email = sandboxDeliveryDecision({ channel: "email", to: "family@example.com", env });
  assert.equal(email.send, false);
  assert.match(email.send ? "" : email.reason, /SANDBOX_ALLOWED_EMAILS/);
});

test("an empty allowlist in sandbox mode blocks everyone", () => {
  const env = { NEXT_PUBLIC_ENVIRONMENT: "staging" };
  assert.equal(sandboxDeliveryDecision({ channel: "sms", to: "+19725550100", env }).send, false);
  assert.equal(sandboxDeliveryDecision({ channel: "email", to: "qa@example.com", env }).send, false);
});

test("allowlists do not cross channels", () => {
  const env = { MESSAGING_SANDBOX: "true", SANDBOX_ALLOWED_PHONES: "+19725550100", SANDBOX_ALLOWED_EMAILS: "" };
  assert.equal(sandboxDeliveryDecision({ channel: "email", to: "+19725550100", env }).send, false);
});

test("both send paths check the sandbox before calling the provider and record skips", async () => {
  const sms = await readFile(new URL("../src/lib/twilio-send.ts", import.meta.url), "utf8");
  const email = await readFile(new URL("../src/lib/email-send.ts", import.meta.url), "utf8");

  const smsCheck = sms.indexOf('sandboxDeliveryDecision({ channel: "sms"');
  assert.ok(smsCheck > 0, "twilio-send must call the sandbox policy");
  assert.ok(smsCheck < sms.indexOf("response = await fetch(endpoint"), "sandbox check must happen before the Twilio call");
  assert.ok(smsCheck < sms.indexOf("Twilio production configuration is incomplete"), "sandbox must not need live credentials");
  assert.match(sms, /recordSandboxSkip\(/);

  const emailCheck = email.indexOf('sandboxDeliveryDecision({ channel: "email"');
  assert.ok(emailCheck > 0, "email-send must call the sandbox policy");
  assert.ok(emailCheck < email.indexOf("api.smtp2go.com"), "sandbox check must happen before the SMTP2GO call");
  assert.match(email, /SANDBOX_SKIPPED_STATUS/);
  assert.equal(SANDBOX_SKIPPED_STATUS, "sandbox_skipped");
});

test("staging compose keeps the sandbox and staging banner on", async () => {
  const compose = await readFile(new URL("../../../docker-compose.coolify.staging.yml", import.meta.url), "utf8");
  assert.match(compose, /MESSAGING_SANDBOX: "true"/);
  assert.match(compose, /NEXT_PUBLIC_ENVIRONMENT: staging/);
  assert.match(compose, /NOTIFICATION_DELIVERY: queue/);
  assert.match(compose, /APP_ROLE: all/);
  assert.match(compose, /SANDBOX_ALLOWED_PHONES/);
  assert.match(compose, /SANDBOX_ALLOWED_EMAILS/);
  const layout = await readFile(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /<StagingBanner \/>/);
});
