import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { accentColorError, contrastRatio, DEFAULT_ACCENT, DEFAULT_TAGLINE, resolveBranding, safeLogoUrl, validateBranding } from "../src/lib/branding-policy.ts";

test("branding requires a name and caps lengths", () => {
  assert.equal(validateBranding({}).errors.displayName, "Enter your community's name");
  assert.ok(validateBranding({ displayName: "x".repeat(81) }).errors.displayName);
  assert.ok(validateBranding({ displayName: "Band", tagline: "t".repeat(121) }).errors.tagline);
  const ok = validateBranding({ displayName: "  Lewisville   Band\u0007 ", tagline: "Ride together" });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.displayName, "Lewisville Band");
});

test("logo links must be plain https", () => {
  assert.equal(safeLogoUrl("javascript:alert(1)"), null);
  assert.equal(safeLogoUrl("data:image/png;base64,AAAA"), null);
  assert.equal(safeLogoUrl("http://example.org/logo.png"), null);
  assert.equal(safeLogoUrl("https://user:pw@example.org/logo.png"), null);
  assert.equal(safeLogoUrl("https://localhost/logo.png"), null);
  assert.equal(safeLogoUrl("https://example.org/logo.png"), "https://example.org/logo.png");
  assert.ok(validateBranding({ displayName: "A", logoUrl: "ftp://x.org/a.png" }).errors.logoUrl);
});

test("button colors must stay readable with navy text", () => {
  assert.equal(accentColorError(DEFAULT_ACCENT), null);
  assert.ok(contrastRatio(DEFAULT_ACCENT, "#071a33") >= 4.5);
  assert.ok(accentColorError("#071a33"), "navy on navy is rejected");
  assert.ok(accentColorError("#8b0000"), "dark red is rejected");
  assert.equal(accentColorError("#7dd3fc"), null, "light blue is fine");
  assert.ok(accentColorError("red"), "must be a hex color");
});

test("the homepage falls back safely when branding is empty or tampered with", () => {
  const empty = resolveBranding({ displayName: null, name: "FloMoGo", branding: {} });
  assert.equal(empty.name, "FloMoGo");
  assert.equal(empty.tagline, DEFAULT_TAGLINE);
  assert.equal(empty.accentColor, DEFAULT_ACCENT);
  const bad = resolveBranding({ displayName: "X", branding: { logoUrl: "javascript:alert(1)", accentColor: "#000000" } });
  assert.equal(bad.logoUrl, null);
  assert.equal(bad.accentColor, DEFAULT_ACCENT);
});

test("tenant homepages use each org's branding, not a hardcoded community", async () => {
  const page = await readFile(new URL("../src/app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /floMoGoBrand/);
  assert.match(page, /resolveBranding\(\{ displayName: tenant\.displayName/);
  assert.match(page, /independence-notice/, "the independent-platform notice stays");
});

test("only owners and admins can change branding, and changes are audited", async () => {
  const lib = await readFile(new URL("../src/lib/org-branding.ts", import.meta.url), "utf8");
  assert.match(lib, /organizationRole === "manager"/);
  assert.match(lib, /organization\.branding_updated/);
  assert.match(lib, /\$1::uuid[\s\S]*\$1::text/);
});
