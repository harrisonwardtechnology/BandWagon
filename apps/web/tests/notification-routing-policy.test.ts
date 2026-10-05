import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MOBILE_NOTIFICATION_TYPES } from "../src/lib/messaging-policy.ts";

type Policy = {
  urgency: string;
  push: boolean;
  emailFallback: boolean;
  emailAlways: boolean;
  smsFallback: boolean;
  smsImmediate: boolean;
  smsOnly: boolean;
};

// The router has "@/" imports, so its POLICIES table is read from source.
async function routerPolicies() {
  const source = await readFile(new URL("../src/lib/notification-router.ts", import.meta.url), "utf8");
  const table = source.slice(source.indexOf("const POLICIES:Record<string,Policy>={"), source.indexOf("const DEFAULT_POLICY"));
  const policies = new Map<string, Policy>();
  const row = /^\s*(\w+):\{urgency:"(\w+)",push:(true|false),emailFallback:(true|false),(?:emailAlways:(true|false),)?smsFallback:(true|false),smsImmediate:(true|false)(?:,smsOnly:(true|false))?\},?\s*$/;
  for (const line of table.split("\n")) {
    const match = line.match(row);
    if (!match) continue;
    policies.set(match[1], {
      urgency: match[2],
      push: match[3] === "true",
      emailFallback: match[4] === "true",
      emailAlways: match[5] === "true",
      smsFallback: match[6] === "true",
      smsImmediate: match[7] === "true",
      smsOnly: match[8] === "true",
    });
  }
  return policies;
}

test("household delegate notifications have their own router policies", async () => {
  const policies = await routerPolicies();
  assert.ok(policies.size >= 20, `expected the full policy table, parsed ${policies.size}`);

  const activity = policies.get("household_delegate_activity");
  assert.ok(activity, "household_delegate_activity needs an explicit policy");
  assert.deepEqual(activity, { urgency: "important", push: true, emailFallback: true, emailAlways: false, smsFallback: false, smsImmediate: false, smsOnly: false });

  const invitation = policies.get("household_delegate_invitation");
  assert.ok(invitation, "household_delegate_invitation needs an explicit policy");
  assert.deepEqual(invitation, { urgency: "important", push: false, emailFallback: true, emailAlways: true, smsFallback: false, smsImmediate: false, smsOnly: false });
});

test("delegate and event proposal notices are never texted", async () => {
  const policies = await routerPolicies();
  for (const type of ["household_delegate_activity", "household_delegate_invitation", "event_proposal_submitted", "event_proposal_decision"]) {
    const policy = policies.get(type);
    assert.ok(policy, type);
    assert.equal(policy.smsFallback || policy.smsImmediate || policy.smsOnly, false, `${type} must not use SMS`);
    // And the SMS allowlist would refuse them even if a policy changed by mistake.
    assert.equal((MOBILE_NOTIFICATION_TYPES as readonly string[]).includes(type), false, `${type} is not on the SMS allowlist`);
  }
});

test("every router policy that can text is on the SMS allowlist", async () => {
  const policies = await routerPolicies();
  for (const [type, policy] of policies) {
    if (policy.smsFallback || policy.smsImmediate || policy.smsOnly) {
      assert.ok((MOBILE_NOTIFICATION_TYPES as readonly string[]).includes(type), `${type} can text but is not in MOBILE_NOTIFICATION_TYPES`);
    }
  }
});

test("the routing table in the docs matches the router policies", async () => {
  const policies = await routerPolicies();
  const doc = await readFile(new URL("../../../docs/NOTIFICATION-ROUTING.md", import.meta.url), "utf8");
  const rows = new Map<string, string[]>();
  for (const line of doc.split("\n")) {
    const match = line.match(/^\| `(\w+)`[^|]*\|(.*)\|\s*$/);
    if (match) rows.set(match[1], match[2].split("|").map((cell) => cell.trim()));
  }
  for (const [type, policy] of policies) {
    const cells = rows.get(type);
    assert.ok(cells, `docs/NOTIFICATION-ROUTING.md has no row for ${type}`);
    const [urgency, push, email, sms] = cells;
    assert.equal(urgency.toLowerCase(), policy.urgency, `${type} urgency`);
    assert.equal(push, policy.push && !policy.smsOnly ? "Yes" : "No", `${type} push`);
    // Critical notices with an email fallback are always emailed, like emailAlways ones.
    const expectedEmail = !policy.emailFallback ? "No" : policy.emailAlways || policy.urgency === "critical" ? "Always" : "If push unavailable";
    assert.ok(email.startsWith(expectedEmail), `${type} email: expected "${expectedEmail}", docs say "${email}"`);
    const expectedSms = policy.smsOnly ? "Only channel" : policy.smsImmediate ? "Immediately" : policy.smsFallback ? "Fallback" : "No";
    assert.ok(sms.startsWith(expectedSms), `${type} SMS/RCS: expected "${expectedSms}", docs say "${sms}"`);
  }
  for (const type of rows.keys()) assert.ok(policies.has(type), `docs list ${type}, which has no router policy`);
});
