import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  FEATURE_REQUEST_CATEGORIES,
  FEATURE_REQUEST_LIMITS,
  FEATURE_REQUEST_RATE_LIMITS,
  FEATURE_REQUEST_STATUSES,
  PUBLIC_FEATURE_REQUEST_STATUSES,
  allowedNextStatuses,
  canViewRequest,
  canVoteOn,
  normalizeSort,
  orderByClause,
  plainText,
  shouldNotifySubmitter,
  statusEmail,
  statusTransitionError,
  validateFeatureRequest,
} from "../src/lib/feature-request-policy.ts";

const ME = "00000000-0000-0000-0000-000000000001";
const OTHER = "00000000-0000-0000-0000-000000000002";
const good = { title: "Copy a ride to next week", details: "It would save time for weekly rehearsals.", category: "rides" };

test("signed-in submissions need a title, details, and category but no email", () => {
  const result = validateFeatureRequest(good, { signedIn: true });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.email, null);
    assert.equal(result.value.category, "rides");
  }
  const bad = validateFeatureRequest({ title: "Hi", details: "short", category: "nope" }, { signedIn: true });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.deepEqual(Object.keys(bad.errors).sort(), ["category", "details", "title"]);
});

test("signed-out submissions require a valid email, which is normalized", () => {
  const missing = validateFeatureRequest(good, { signedIn: false });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.ok(missing.errors.email);
  const invalid = validateFeatureRequest({ ...good, email: "not-an-email" }, { signedIn: false });
  assert.equal(invalid.ok, false);
  const ok = validateFeatureRequest({ ...good, email: "  Parent@Example.COM " }, { signedIn: false });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.value.email, "parent@example.com");
  // Signed-in submitters never have an email stored even if one is posted.
  const signedIn = validateFeatureRequest({ ...good, email: "x@example.com" }, { signedIn: true });
  if (signedIn.ok) assert.equal(signedIn.value.email, null);
});

test("length limits are enforced, not silently truncated", () => {
  const longTitle = validateFeatureRequest({ ...good, title: "a".repeat(FEATURE_REQUEST_LIMITS.titleMax + 5) }, { signedIn: true });
  assert.equal(longTitle.ok, false);
  const longDetails = validateFeatureRequest({ ...good, details: "b".repeat(FEATURE_REQUEST_LIMITS.detailsMax + 5) }, { signedIn: true });
  assert.equal(longDetails.ok, false);
  const exact = validateFeatureRequest({ ...good, title: "a".repeat(FEATURE_REQUEST_LIMITS.titleMax) }, { signedIn: true });
  assert.equal(exact.ok, true);
});

test("HTML and control characters are stripped and link spam is refused", () => {
  assert.equal(plainText("<script>alert(1)</script>Hello <b>there</b>", 200), "alert(1) Hello there");
  assert.equal(plainText("a<>b\u0000c", 200), "ab c");
  assert.equal(plainText("line one\r\n\r\n\r\n\r\nline two", 200, true), "line one\n\nline two");
  assert.equal(plainText("line one\nline two", 200), "line one line two");
  const result = validateFeatureRequest({ ...good, title: "<img src=x onerror=alert(1)>Better rides" }, { signedIn: true });
  assert.equal(result.ok, true);
  if (result.ok) assert.ok(!/[<>]/.test(result.value.title));
  const linky = validateFeatureRequest({ ...good, details: "see https://a.test https://b.test https://c.test https://d.test" }, { signedIn: true });
  assert.equal(linky.ok, false);
  const titleLink = validateFeatureRequest({ ...good, title: "Visit www.spam.test now" }, { signedIn: true });
  assert.equal(titleLink.ok, false);
});

test("status transitions follow the review workflow", () => {
  assert.equal(statusTransitionError("new", "under_review"), null);
  assert.equal(statusTransitionError("new", "planned"), null);
  assert.equal(statusTransitionError("planned", "in_progress"), null);
  assert.equal(statusTransitionError("in_progress", "shipped"), null);
  assert.equal(statusTransitionError("declined", "under_review"), null);
  assert.ok(statusTransitionError("under_review", "new"));
  assert.ok(statusTransitionError("shipped", "declined"));
  assert.ok(statusTransitionError("planned", "planned"));
  assert.ok(statusTransitionError("planned", "bogus"));
  assert.ok(statusTransitionError("new", "duplicate"), "duplicate needs an original");
  assert.ok(statusTransitionError("new", "duplicate", { duplicateOfId: ME, requestId: ME }), "cannot duplicate itself");
  assert.equal(statusTransitionError("new", "duplicate", { duplicateOfId: OTHER, requestId: ME }), null);
  assert.equal(statusTransitionError("duplicate", "duplicate", { duplicateOfId: OTHER, requestId: ME }), null, "can repoint a duplicate");
  for (const status of Object.keys(FEATURE_REQUEST_STATUSES)) assert.ok(!allowedNextStatuses(status).includes("new" as never));
  assert.deepEqual(allowedNextStatuses("nope"), []);
});

test("visibility, voting, and notifications", () => {
  assert.deepEqual(PUBLIC_FEATURE_REQUEST_STATUSES, ["under_review", "planned", "in_progress", "shipped"]);
  assert.equal(canViewRequest({ status: "new", person_id: OTHER }, ME), false);
  assert.equal(canViewRequest({ status: "new", person_id: ME }, ME), true);
  assert.equal(canViewRequest({ status: "declined", person_id: OTHER }, ME), false);
  assert.equal(canViewRequest({ status: "planned", person_id: null }, ME), true);
  assert.equal(canViewRequest({ status: "new", person_id: null }, null), false);
  assert.equal(canVoteOn("planned"), true);
  assert.equal(canVoteOn("new"), false);
  assert.equal(canVoteOn("shipped"), false);
  assert.equal(canVoteOn("declined"), false);
  assert.equal(shouldNotifySubmitter("new", "planned"), true);
  assert.equal(shouldNotifySubmitter("in_progress", "shipped"), true);
  assert.equal(shouldNotifySubmitter("new", "declined"), true);
  assert.equal(shouldNotifySubmitter("new", "under_review"), false);
  assert.equal(shouldNotifySubmitter("planned", "planned"), false);
  const email = statusEmail({ title: "Copy rides", status: "shipped", publicNote: "Live now", link: "https://bandwagon.club/help/ideas" });
  assert.match(email.subject, /Copy rides/);
  assert.match(email.body, /Live now/);
  assert.ok(!/—/.test(email.body + email.subject), "no em dashes in copy");
});

test("sorting only uses fixed SQL fragments", () => {
  assert.equal(normalizeSort("newest"), "newest");
  assert.equal(normalizeSort("votes; drop table people"), "votes");
  assert.equal(orderByClause("votes"), "fr.vote_count desc, fr.created_at desc");
  assert.equal(orderByClause("newest"), "fr.created_at desc");
});

test("category and status lists match the migration check constraints", async () => {
  const sql = await readFile(new URL("../database/migrations/057_feature_requests.sql", import.meta.url), "utf8");
  const categories = sql.match(/category IN \(([^)]*)\)/)?.[1].replace(/'/g, "").split(",").map((s) => s.trim());
  const statuses = sql.match(/status IN \(([^)]*)\)/)?.[1].replace(/'/g, "").split(",").map((s) => s.trim());
  assert.deepEqual(categories, Object.keys(FEATURE_REQUEST_CATEGORIES));
  assert.deepEqual(statuses, Object.keys(FEATURE_REQUEST_STATUSES));
  assert.match(sql, new RegExp(`char_length\\(title\\) BETWEEN ${FEATURE_REQUEST_LIMITS.titleMin} AND ${FEATURE_REQUEST_LIMITS.titleMax}`));
  assert.match(sql, new RegExp(`char_length\\(details\\) BETWEEN ${FEATURE_REQUEST_LIMITS.detailsMin} AND ${FEATURE_REQUEST_LIMITS.detailsMax}`));
});

test("one vote per person is enforced by the schema and the insert", async () => {
  const sql = await readFile(new URL("../database/migrations/057_feature_requests.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS feature_request_votes[\s\S]*PRIMARY KEY \(request_id, person_id\)/);
  assert.match(sql, /email_ciphertext text/);
  assert.ok(!/\bemail text\b/.test(sql), "signed-out emails are never stored in plain text");
  const lib = await readFile(new URL("../src/lib/feature-requests.ts", import.meta.url), "utf8");
  assert.match(lib, /insert into feature_request_votes \(request_id,person_id\) values \(\$1::uuid,\$2::uuid\)\s*on conflict \(request_id,person_id\) do nothing/);
  assert.match(lib, /vote_count=\(select count\(\*\)::int from feature_request_votes where request_id=\$1::uuid\)/);
  assert.match(lib, /encryptSensitive\(email\)/);
  assert.match(lib, /'feature_request\.status_changed'|"feature_request\.status_changed"/);
  const verify = await readFile(new URL("../scripts/verify-schema.mjs", import.meta.url), "utf8");
  assert.match(verify, /"feature_requests"/);
  assert.match(verify, /"feature_request_votes"/);
});

test("routes rate limit, verify Turnstile for signed-out users, and gate admin access", async () => {
  const lib = await readFile(new URL("../src/lib/feature-requests.ts", import.meta.url), "utf8");
  const route = await readFile(new URL("../src/app/api/feature-requests/route.ts", import.meta.url), "utf8");
  const admin = await readFile(new URL("../src/app/api/admin/feature-requests/route.ts", import.meta.url), "utf8");
  const form = await readFile(new URL("../src/components/feature-ideas.tsx", import.meta.url), "utf8");
  const adminPage = await readFile(new URL("../src/app/admin/feature-requests/page.tsx", import.meta.url), "utf8");
  for (const key of ["feature-request:ip:", "feature-request:person:", "feature-request:email:", "feature-request:vote:"]) assert.ok(lib.includes(key), `missing rate limit ${key}`);
  assert.ok(FEATURE_REQUEST_RATE_LIMITS.submitPerEmail <= FEATURE_REQUEST_RATE_LIMITS.submitPerPerson);
  assert.match(route, /submitAllowed\(/);
  assert.match(route, /voteAllowed\(/);
  assert.match(route, /verifyTurnstileToken\(request, body\.turnstileToken, "feature_request"\)/);
  assert.match(form, /action="feature_request"/);
  assert.match(route, /companyWebsite/);
  assert.match(admin, /requirePlatformRole\(\["owner", "support"\]\)/);
  assert.match(lib, /PLATFORM_OWNER_EMAIL \|\| process\.env\.SUPPORT_EMAIL/);
  for (const source of [form, adminPage]) assert.ok(!source.includes("dangerouslySetInnerHTML"), "submitted text must render as plain text");
});

test("Rate limits still apply without Redis by counting the last hour in Postgres", async () => {
  const src = await readFile(new URL("../src/lib/feature-requests.ts", import.meta.url), "utf8");
  assert.match(src, /if \(!getRedis\(\)\) return submitAllowedFromDb\(ip, who\)/);
  assert.match(src, /if \(!getRedis\(\)\) return voteAllowedFromDb\(personId\)/);
  assert.match(src, /interval '1 hour'/);
});
