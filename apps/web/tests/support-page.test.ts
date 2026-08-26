import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("support page accepts custom contributions of at least one dollar", () => {
  const page = fs.readFileSync("src/app/support/page.tsx", "utf8");
  const checkout = fs.readFileSync("src/app/api/support/checkout/route.ts", "utf8");

  assert.match(page, /Other amount/);
  assert.match(page, /min="1"/);
  assert.match(page, /step="0\.01"/);
  assert.match(page, /dollars<1/);
  assert.match(checkout, /amountCents < 100/);
  assert.doesNotMatch(page, /TurnstileWidget|turnstileToken|support_checkout/);
  assert.doesNotMatch(checkout, /verifyTurnstileToken|turnstileConfigured/);
  assert.match(checkout, /support-checkout:ip:/);
  assert.match(checkout, /count<=20/);
});
