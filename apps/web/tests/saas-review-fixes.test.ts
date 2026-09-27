import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");

test("only adults can request, own, or administer an organization", async () => {
  const requests = await read("lib/organization-requests.ts");
  assert.match(requests, /identity\.personType !== "adult"/);
  assert.match(requests, /Re-check at approval time[\s\S]*person_type/);
  const invites = await read("lib/organization-invitations.ts");
  assert.match(invites, /acceptInvitation[\s\S]*identity\.personType !== "adult"/);
});

test("sponsors created by public checkout stay hidden until an org admin approves them", async () => {
  const stripe = await read("lib/stripe-support.ts");
  assert.match(stripe, /insert into organization_sponsors[\s\S]*values \(\$1,\$2,\$3,\$4,false,'active'\)/);
});

test("invitation email volume is capped per organization and per inviter", async () => {
  const invites = await read("lib/organization-invitations.ts");
  assert.match(invites, /created_at>now\(\)-interval '1 hour'/);
  assert.match(invites, /Too many invitations/);
});

test("the public impact page shows one period so small counts cannot be subtracted out", async () => {
  const impact = await read("lib/org-impact.ts");
  assert.match(impact, /rows: report\.rows\.filter\(\(row\) => row\.key === "all_time"\)/);
});

test("internal limit notes are not returned to organization admins", async () => {
  const route = await read("app/api/admin/usage/route.ts");
  assert.match(route, /if \(!identity\.platformRole && usage\?\.texting\)/);
});

test("transactions run on one dedicated connection, never BEGIN through the pool", async () => {
  for (const file of ["lib/saas-tenants.ts", "lib/organization-decommission.ts", "lib/organization-decommission-worker.ts", "lib/security-report-admin.ts"]) {
    const source = await read(file);
    assert.doesNotMatch(source, /\bdb\.query\(\s*["'`]begin/i, file);
  }
});

test("product copy does not claim open source or blanket phone encryption", async () => {
  const home = await read("app/ProductHome.tsx");
  assert.doesNotMatch(home, /Open source/);
  assert.match(home, /Profile phone numbers/);
});

test("public contact addresses live on the bandwagon.club mail domain", async () => {
  const links = await read("lib/public-links.ts");
  for (const box of ["support", "privacy", "security", "sponsors"]) assert.match(links, new RegExp(`"${box}@bandwagon\\.club"`));
  for (const file of ["app/privacy/page.tsx", "app/cookies/page.tsx", "lib/push.ts"]) {
    assert.doesNotMatch(await read(file), /help\+\w+@harrisonward\.com/, file);
  }
});
