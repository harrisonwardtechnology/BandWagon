import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { analyticsConfig, scrubAnalyticsUrl } from "../src/lib/analytics-policy.ts";

test("analytics stays off until a valid website ID is set", () => {
  assert.equal(analyticsConfig({}), null);
  assert.equal(analyticsConfig({ NEXT_PUBLIC_UMAMI_WEBSITE_ID: "not-an-id" }), null);
  const on = analyticsConfig({ NEXT_PUBLIC_UMAMI_WEBSITE_ID: "0b6c2f4e-1a2b-4c3d-9e8f-123456789abc" });
  assert.equal(on?.src, "https://stats.harrisonward.net/script.js");
  assert.equal(analyticsConfig({ NEXT_PUBLIC_UMAMI_WEBSITE_ID: "0b6c2f4e-1a2b-4c3d-9e8f-123456789abc", NEXT_PUBLIC_UMAMI_SRC: "http://insecure/x.js" }), null);
});

test("URLs lose query strings, hashes and invite tokens", () => {
  assert.equal(scrubAnalyticsUrl("/app/rides?email=a@b.com#x"), "/app/rides");
  assert.equal(scrubAnalyticsUrl("https://bandwagon.club/invite/SECRET123"), "/invite/:token");
  assert.equal(scrubAnalyticsUrl("/household-invite/abc/accept"), "/household-invite/:token/accept");
  assert.equal(scrubAnalyticsUrl("/organization-decommission/confirm?token=x"), "/organization-decommission/confirm");
});

test("tracker is cookieless, honors Do Not Track and scrubs before sending", () => {
  const c = fs.readFileSync("src/components/umami-analytics.tsx", "utf8");
  for (const attr of ['data-exclude-search="true"', 'data-exclude-hash="true"', 'data-do-not-track="true"', 'data-before-send="bwUmamiBeforeSend"']) assert.ok(c.includes(attr), attr);
  assert.doesNotMatch(c, /identify\(/);
  const cookies = fs.readFileSync("src/app/cookies/page.tsx", "utf8");
  assert.match(cookies, /Umami/);
  assert.match(cookies, /sets no cookies/);
});
