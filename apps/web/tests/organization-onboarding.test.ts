import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  MAX_OPEN_ORGANIZATION_REQUESTS,
  ORGANIZATION_AGREEMENT_VERSION,
  ORGANIZATION_REVIEW_CHECKLIST,
  SETUP_CHECKLIST,
  canWithdrawRequest,
  computeSetupProgress,
  isManualSetupItem,
  isReservedTenantSlug,
  normalizeReviewChecklist,
  normalizeSlug,
  normalizeWebsite,
  openRequestLimitReached,
  reviewDecisionError,
  tenantSlugError,
  validateOrganizationRequest,
} from "../src/lib/organization-onboarding-policy.ts";
import {
  INVITATION_TTL_DAYS,
  acceptedMembershipRole,
  invitableRoles,
  invitationEmailMatches,
  invitationExpiresAt,
  invitationRoleError,
  invitationState,
  isValidInviteEmail,
  looksLikeInvitationToken,
} from "../src/lib/organization-invitation-policy.ts";

const validRequest = {
  organizationName: "Example High Band",
  slug: "Example-High Band",
  organizationType: "school_band",
  city: "Flower Mound",
  state: "TX",
  approximateFamilies: 120,
  requesterRole: "Booster president",
  sponsoringOrganization: "",
  website: "example.org",
  rideDescription: "Parents share rides to Saturday competitions and early practices.",
  agreementAccepted: true,
};

test("slug rules normalize, enforce length, and block reserved names", () => {
  assert.equal(normalizeSlug("  Example High__Band!! "), "example-high-band");
  assert.equal(tenantSlugError("ok"), null);
  assert.match(tenantSlugError("a") || "", /2 to 50/);
  assert.match(tenantSlugError("x".repeat(51)) || "", /2 to 50/);
  assert.match(tenantSlugError("") || "", /Choose/);
  for (const reserved of ["www", "admin", "API", "status", "help", "docs"]) {
    assert.equal(isReservedTenantSlug(reserved), true, reserved);
    assert.match(tenantSlugError(reserved) || "", /reserved/);
  }
  assert.equal(isReservedTenantSlug("flomogo"), false);
});

test("saas-tenants keeps using the shared slug rules", () => {
  const source = fs.readFileSync("src/lib/saas-tenants.ts", "utf8");
  assert.match(source, /from "@\/lib\/organization-onboarding-policy"/);
  assert.doesNotMatch(source, /export function normalizeSlug/);
  assert.match(source, /export async function createOrganization\(/);
  assert.match(source, /export async function createOrganizationWithClient\(/);
});

test("organization request validation accepts a complete request", () => {
  const result = validateOrganizationRequest(validRequest);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.slug, "example-high-band");
  assert.equal(result.value.website, "https://example.org/");
  assert.equal(result.value.sponsoringOrganization, null);
  assert.equal(ORGANIZATION_AGREEMENT_VERSION, "2026-09-26-draft");
});

test("organization request validation reports each bad field", () => {
  const result = validateOrganizationRequest({ ...validRequest, organizationName: "", slug: "admin", organizationType: "casino", approximateFamilies: 0, website: "not a url", rideDescription: "short", agreementAccepted: false });
  assert.equal(result.ok, false);
  if (result.ok) return;
  for (const key of ["organizationName", "slug", "organizationType", "approximateFamilies", "website", "rideDescription", "agreementAccepted"]) {
    assert.ok(result.errors[key], `expected an error for ${key}`);
  }
  assert.equal(validateOrganizationRequest({ ...validRequest, agreementAccepted: "true" }).ok, false, "agreement must be a real boolean");
});

test("website normalization only allows web URLs", () => {
  assert.equal(normalizeWebsite(""), null);
  assert.equal(normalizeWebsite("https://band.example.org/path"), "https://band.example.org/path");
  assert.equal(normalizeWebsite("javascript:alert(1)"), undefined);
  assert.equal(normalizeWebsite("localhost"), undefined);
});

test("open request limit and withdraw rules", () => {
  assert.equal(openRequestLimitReached(MAX_OPEN_ORGANIZATION_REQUESTS - 1), false);
  assert.equal(openRequestLimitReached(MAX_OPEN_ORGANIZATION_REQUESTS), true);
  assert.equal(canWithdrawRequest("pending"), true);
  for (const status of ["approved", "rejected", "withdrawn"]) assert.equal(canWithdrawRequest(status), false);
});

test("review decisions require a full checklist to approve and a note to reject", () => {
  const all = Object.fromEntries(ORGANIZATION_REVIEW_CHECKLIST.map(item => [item.key, true]));
  const some = normalizeReviewChecklist({ [ORGANIZATION_REVIEW_CHECKLIST[0].key]: true, bogus: true });
  assert.equal(Object.keys(some).includes("bogus"), false);
  assert.equal(reviewDecisionError({ decision: "approve", status: "pending", note: null, checklist: all }), null);
  assert.match(reviewDecisionError({ decision: "approve", status: "pending", note: null, checklist: some }) || "", /checklist/);
  assert.match(reviewDecisionError({ decision: "reject", status: "pending", note: "  ", checklist: all }) || "", /note/);
  assert.equal(reviewDecisionError({ decision: "reject", status: "pending", note: "Please add your school sponsor.", checklist: {} }), null);
  assert.match(reviewDecisionError({ decision: "approve", status: "approved", note: null, checklist: all }) || "", /already/);
});

test("invitation roles: owners invite admins and managers, admins invite managers, managers invite nobody", () => {
  assert.deepEqual(invitableRoles("owner"), ["admin", "manager"]);
  assert.deepEqual(invitableRoles("admin"), ["manager"]);
  assert.deepEqual(invitableRoles("manager"), []);
  assert.deepEqual(invitableRoles("member"), []);
  assert.deepEqual(invitableRoles(null, { platformOwner: true }), ["admin", "manager"]);
  assert.equal(invitationRoleError("owner", "admin"), null);
  assert.match(invitationRoleError("admin", "admin") || "", /Only an owner/);
  assert.equal(invitationRoleError("admin", "manager"), null);
  assert.match(invitationRoleError("manager", "manager") || "", /Only owners and admins/);
  assert.match(invitationRoleError("owner", "owner") || "", /admin or manager/);
});

test("accepting an invitation never downgrades an existing role", () => {
  assert.equal(acceptedMembershipRole("owner", "admin"), "owner");
  assert.equal(acceptedMembershipRole("owner", "manager"), "owner");
  assert.equal(acceptedMembershipRole("admin", "manager"), "admin");
  assert.equal(acceptedMembershipRole("manager", "admin"), "admin");
  assert.equal(acceptedMembershipRole("member", "manager"), "manager");
  assert.equal(acceptedMembershipRole(null, "admin"), "admin");
  assert.equal(acceptedMembershipRole("unknown-role", "manager"), "manager");
});

test("invitation expiry and state", () => {
  const now = new Date("2026-09-26T12:00:00Z");
  const expires = invitationExpiresAt(now);
  assert.equal(INVITATION_TTL_DAYS, 7);
  assert.equal(expires.getTime() - now.getTime(), 7 * 24 * 60 * 60 * 1000);
  assert.equal(invitationState({ expiresAt: expires }, now), "active");
  assert.equal(invitationState({ expiresAt: expires }, new Date(expires.getTime() + 1)), "expired");
  assert.equal(invitationState({ expiresAt: expires }, expires), "expired");
  assert.equal(invitationState({ expiresAt: expires, revokedAt: now }, now), "revoked");
  assert.equal(invitationState({ expiresAt: now, acceptedAt: now, revokedAt: now }, now), "accepted");
});

test("invitation email matching is case-insensitive and exact", () => {
  assert.equal(invitationEmailMatches("Parent@Example.org", ["someone@else.org", "parent@example.org"]), true);
  assert.equal(invitationEmailMatches(" parent@example.org ", ["PARENT@EXAMPLE.ORG"]), true);
  assert.equal(invitationEmailMatches("parent@example.org", ["parent@example.org.evil.com"]), false);
  assert.equal(invitationEmailMatches("parent@example.org", []), false);
  assert.equal(isValidInviteEmail("a@b.co"), true);
  assert.equal(isValidInviteEmail("nope"), false);
  assert.equal(looksLikeInvitationToken("A".repeat(43)), true);
  assert.equal(looksLikeInvitationToken("A".repeat(42)), false);
  assert.equal(looksLikeInvitationToken("../../etc/passwd"), false);
});

test("setup checklist math counts automatic and allowed manual items", () => {
  const empty = computeSetupProgress({}, []);
  assert.equal(empty.total, SETUP_CHECKLIST.length);
  assert.equal(empty.completed, 0);
  assert.equal(empty.percent, 0);
  const partial = computeSetupProgress({ join_code: true, policies: true }, ["notifications", "test_ride"]);
  assert.equal(partial.completed, 3, "test_ride cannot be marked done by hand");
  assert.equal(partial.items.find(i => i.key === "notifications")?.source, "manual");
  assert.equal(partial.items.find(i => i.key === "join_code")?.source, "automatic");
  assert.equal(partial.percent, Math.round((3 / SETUP_CHECKLIST.length) * 100));
  const all = computeSetupProgress(Object.fromEntries(SETUP_CHECKLIST.map(i => [i.key, true])), []);
  assert.equal(all.allDone, true);
  assert.equal(all.percent, 100);
  assert.equal(isManualSetupItem("branding"), false, "branding is detected from saved branding");
  assert.equal(isManualSetupItem("notifications"), true);
  assert.equal(isManualSetupItem("policies"), false);
  assert.equal(isManualSetupItem("nope"), false);
});

test("invitation tokens are random 32 bytes and only their sha256 hash is stored", () => {
  const source = fs.readFileSync("src/lib/organization-invitations.ts", "utf8");
  const migration = fs.readFileSync("database/migrations/055_org_onboarding.sql", "utf8");
  assert.match(source, /crypto\.randomBytes\(32\)/);
  assert.match(source, /createHash\("sha256"\)/);
  assert.match(source, /token_hash/);
  assert.doesNotMatch(source, /insert into organization_invitations[^;]*\btoken\b(?!_hash)/i);
  assert.match(migration, /token_hash text NOT NULL UNIQUE/);
  assert.doesNotMatch(migration, /\btoken text\b/);
  const route = fs.readFileSync("src/app/api/invitations/route.ts", "utf8");
  assert.match(route, /body\.token/, "tokens travel in the POST body, not the API URL");
});

test("approval creates the organization, owner membership and decision in one transaction", () => {
  const source = fs.readFileSync("src/lib/organization-requests.ts", "utf8");
  const approve = source.slice(source.indexOf("export async function decideOrganizationRequest"));
  const begin = approve.indexOf('client.query("begin")');
  const commit = approve.indexOf('client.query("commit")');
  assert.ok(begin > 0 && commit > begin, "approval must begin and commit a transaction");
  const body = approve.slice(begin, commit);
  assert.match(body, /lockPendingRequest\(client/);
  assert.match(source, /from organization_requests where id=\$1 for update/);
  assert.match(body, /createOrganizationWithClient\(client/);
  assert.match(body, /insert into memberships[\s\S]*'owner','active'/);
  assert.match(body, /status='approved'/);
  assert.match(body, /organization_request\.approved/);
  assert.match(approve, /client\.query\("rollback"\)/);
  assert.match(approve, /client\.release\(\)/);
  const tenants = fs.readFileSync("src/lib/saas-tenants.ts", "utf8");
  assert.match(tenants, /seedOrganizationDefaults\(client/);
});

test("request and review routes enforce sign-in, Turnstile, rate limits and platform roles", () => {
  const route = fs.readFileSync("src/app/api/organization-requests/route.ts", "utf8");
  const page = fs.readFileSync("src/app/start/page.tsx", "utf8");
  assert.match(route, /verifyTurnstileToken\(request, body\.turnstileToken, "organization_request"\)/);
  assert.match(route, /org-request:ip:/);
  assert.match(route, /status: 401/);
  assert.match(page, /action="organization_request"/);
  assert.match(page, /\/legal\/organization-agreement/);
  const admin = fs.readFileSync("src/app/api/admin/organization-requests/route.ts", "utf8");
  assert.match(admin, /requirePlatformRole\(\["owner", "support"\]\)/);
  assert.match(admin, /requirePlatformRole\(\["owner"\]\)/);
});

test("onboarding UI copy avoids em dashes", () => {
  for (const file of ["src/app/start/page.tsx", "src/app/admin/organization-requests/page.tsx", "src/app/admin/setup/page.tsx", "src/app/invite/[token]/invite-accept.tsx", "src/lib/organization-onboarding-policy.ts", "src/lib/organization-invitation-policy.ts", "src/lib/organization-requests.ts", "src/lib/organization-invitations.ts"]) {
    assert.doesNotMatch(fs.readFileSync(file, "utf8"), /—/, file);
  }
});
