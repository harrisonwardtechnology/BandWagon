import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { ORGANIZATION_AGREEMENT_VERSION } from "../src/lib/legal-versions.ts";
import { safePublicUrl } from "../src/lib/public-links.ts";

const legalPages = [
  "src/app/legal/page.tsx",
  "src/app/legal/organization-agreement/page.tsx",
  "src/app/legal/subprocessors/page.tsx",
  "src/app/legal/student-data/page.tsx",
];

test("every legal page shows the draft banner", () => {
  const banner = fs.readFileSync("src/components/legal-draft-banner.tsx", "utf8");
  assert.match(banner, /Draft for legal review\. Not yet final\./);
  for (const file of legalPages) {
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, /import \{ LegalDraftBanner \} from "@\/components\/legal-draft-banner"/, `${file} must import the banner`);
    assert.match(source, /<LegalDraftBanner \/>/, `${file} must render the banner`);
  }
});

test("organization agreement carries its version and required sections", () => {
  assert.equal(ORGANIZATION_AGREEMENT_VERSION, "2026-09-26-draft");
  const source = fs.readFileSync("src/app/legal/organization-agreement/page.tsx", "utf8");
  assert.match(source, /ORGANIZATION_AGREEMENT_VERSION/);
  for (const phrase of [/not a transportation provider/i, /voluntary/i, /Acceptable use/, /sponsors receive no participant data/i, /guardian/i, /incident/i, /Closing a community/, /Limitation of liability/, /Texas law governs/]) {
    assert.match(source, phrase);
  }
});

test("legal copy avoids em dashes and certification claims", () => {
  for (const file of legalPages) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /—/, `${file} must not use em dashes`);
  }
  const student = fs.readFileSync("src/app/legal/student-data/page.tsx", "utf8");
  assert.match(student, /not making a claim of formal certification/);
  assert.doesNotMatch(student, /\b(FERPA|COPPA)[- ]compliant\b/i);
});

test("subprocessor list names the providers the code calls", () => {
  const source = fs.readFileSync("src/app/legal/subprocessors/page.tsx", "utf8");
  for (const vendor of ["IONOS", "Cloudflare", "SMTP2GO", "Twilio", "Google Maps", "Google Calendar", "Microsoft Graph", "Google Document AI", "LiteLLM", "Stripe", "DoDomain", "Web push"]) {
    assert.ok(source.includes(vendor), `missing ${vendor}`);
  }
});

test("legal pages are linked from the footer, terms, and privacy policy", () => {
  assert.match(fs.readFileSync("src/app/layout.tsx", "utf8"), /href="\/legal"/);
  assert.match(fs.readFileSync("src/app/terms/page.tsx", "utf8"), /\/legal\/organization-agreement/);
  assert.match(fs.readFileSync("src/app/privacy/page.tsx", "utf8"), /\/legal\/subprocessors/);
});

test("product homepage covers the organization front door", () => {
  const home = fs.readFileSync("src/app/ProductHome.tsx", "utf8");
  const page = fs.readFileSync("src/app/page.tsx", "utf8");
  assert.match(page, /tenant\.type !== "organization"\) return <ProductHome \/>/);
  assert.match(home, /href="\/start"/);
  assert.match(home, /href="\/login"/);
  assert.match(home, /bandwagon-demo\.harrisonward\.net/);
  for (const q of ["Is this school transportation?", "What does it cost?", "What data do sponsors get?", "Do students need accounts?", "How are drivers checked?"]) {
    assert.ok(home.includes(q), `missing FAQ: ${q}`);
  }
  assert.doesNotMatch(home, /<script/i);
  assert.doesNotMatch(home, /—/);
});

test("status and help desk links come from env and are optional", () => {
  assert.equal(safePublicUrl(""), null);
  assert.equal(safePublicUrl("javascript:alert(1)"), null);
  assert.equal(safePublicUrl("https://help.harrisonward.net"), "https://help.harrisonward.net/");
  const links = fs.readFileSync("src/lib/public-links.ts", "utf8");
  assert.match(links, /NEXT_PUBLIC_HELP_DESK_URL/);
  assert.match(links, /NEXT_PUBLIC_STATUS_PAGE_URL/);
  assert.doesNotMatch(links, /help\.harrisonward\.net/, "help desk URL must not be hardcoded");
  const status = fs.readFileSync("src/app/status/ReadinessCheck.tsx", "utf8");
  assert.match(status, /\/api\/health\/ready/);
  const contact = fs.readFileSync("src/components/support-contact.tsx", "utf8");
  assert.match(contact, /mailto:/, "email stays as the fallback");
});
