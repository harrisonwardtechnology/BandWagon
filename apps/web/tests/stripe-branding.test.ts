import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("BandWagon Checkout uses product-specific branding and support language", async () => {
  const source = await readFile(new URL("../src/lib/stripe-support.ts", import.meta.url), "utf8");
  assert.match(source, /branding_settings\[display_name\].*BandWagon by Harrison Ward Technology/);
  assert.match(source, /STRIPE_BANDWAGON_LOGO_FILE_ID/);
  assert.match(source, /branding_settings\[logo\]\[file\]/);
  assert.match(source, /branding_settings\[logo\]\[url\].*bandwagon-logo\.svg/);
  assert.doesNotMatch(source, /branding_settings\[icon\]/);
  assert.match(source, /statement_descriptor_suffix.*BANDWAGON/);
  assert.match(source, /params\.set\("submit_type", "pay"\)/);
  assert.doesNotMatch(source, /submit_type.*donate/);
  assert.match(source, /not tax-deductible charitable contributions/);
});
