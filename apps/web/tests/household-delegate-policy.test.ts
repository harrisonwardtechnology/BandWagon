import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DELEGATE_FORBIDDEN_ACTIONS,
  DELEGATE_INVITES_PER_HOUSEHOLD_PER_DAY,
  DELEGATE_INVITES_PER_INVITER_PER_HOUR,
  DELEGATE_INVITE_TTL_DAYS,
  delegateEligibility,
  delegateGrantAllows,
  delegateGrantRightsError,
  delegateInviteAcceptBlock,
  delegateGrantInputError,
  delegateGrantState,
  delegateInviteAcceptError,
  delegateInviteExpiresAt,
  delegateInviteRateLimitError,
  delegateInviteState,
  evaluateChildAccess,
  isValidDelegateEmail,
  looksLikeDelegateToken,
  maskContact,
  parseDelegateScopes,
  type ChildAction,
  type DelegateGrant,
  type DelegateScopes,
} from "../src/lib/household-delegate-policy.ts";

const NOW = new Date("2026-09-27T12:00:00Z");
const CHILD = "child-1";
const OTHER_CHILD = "child-2";
const NONE: DelegateScopes = { requestRides: false, approveRides: false, viewRideDetails: false, receiveNotifications: false };
const ALL: DelegateScopes = { requestRides: true, approveRides: true, viewRideDetails: true, receiveNotifications: true };

function grant(overrides: Partial<DelegateGrant> = {}): DelegateGrant {
  return {
    id: "grant-1",
    status: "active",
    startsAt: "2026-09-01T00:00:00Z",
    endsAt: null,
    scopes: ALL,
    childScope: "all",
    childIds: [],
    delegateIsAdult: true,
    delegateActive: true,
    householdActive: true,
    childInHousehold: true,
    childIsMinor: true,
    ...overrides,
  };
}

function delegateCan(g: DelegateGrant, action: ChildAction, options: { childId?: string; organizationAllowsDelegates?: boolean | null } = {}) {
  return evaluateChildAccess({
    actorIsChild: false,
    guardian: null,
    delegates: [g],
    childId: options.childId || CHILD,
    action,
    organizationAllowsDelegates: options.organizationAllowsDelegates,
    now: NOW,
  });
}

test("each delegate scope allows only its own action", () => {
  const cases: Array<[keyof DelegateScopes, ChildAction[]]> = [
    ["requestRides", ["request_rides", "manage_ride_request"]],
    ["approveRides", ["approve_rides"]],
    ["viewRideDetails", ["view_ride_details"]],
    ["receiveNotifications", ["receive_notifications"]],
  ];
  const actions: ChildAction[] = ["request_rides", "approve_rides", "manage_ride_request", "view_ride_details", "receive_notifications"];
  for (const [scope, allowed] of cases) {
    const g = grant({ scopes: { ...NONE, [scope]: true } });
    for (const action of actions) {
      const decision = delegateCan(g, action);
      assert.equal(decision.allowed, allowed.includes(action), `${scope} -> ${action}`);
      if (decision.allowed) {
        assert.equal(decision.via, "delegate");
        assert.equal(decision.delegateId, "grant-1");
      }
    }
  }
});

test("a grant with no scopes allows nothing", () => {
  for (const action of ["request_rides", "approve_rides", "manage_ride_request", "view_ride_details", "receive_notifications"] as ChildAction[]) {
    assert.equal(delegateCan(grant({ scopes: NONE }), action).allowed, false, action);
  }
});

test("forbidden actions are always denied for delegates, even with every scope", () => {
  for (const action of DELEGATE_FORBIDDEN_ACTIONS) {
    const decision = delegateCan(grant({ scopes: ALL }), action);
    assert.equal(decision.allowed, false, action);
    assert.equal(delegateGrantAllows(grant(), CHILD, action, { now: NOW }).reason, "Delegates cannot do this");
  }
  assert.deepEqual([...DELEGATE_FORBIDDEN_ACTIONS].sort(), [
    "edit_child_profile",
    "edit_child_safety",
    "manage_children",
    "manage_delegates",
    "manage_guardians",
    "view_other_households",
  ]);
});

test("revoked, paused, expired, and not yet started grants are denied", () => {
  assert.equal(delegateCan(grant({ status: "revoked" }), "request_rides").allowed, false);
  assert.equal(delegateCan(grant({ status: "paused" }), "request_rides").allowed, false);
  assert.equal(delegateCan(grant({ endsAt: "2026-09-27T11:59:59Z" }), "request_rides").allowed, false);
  assert.equal(delegateCan(grant({ endsAt: NOW.toISOString() }), "request_rides").allowed, false);
  assert.equal(delegateCan(grant({ startsAt: "2026-09-28T00:00:00Z" }), "request_rides").allowed, false);
  assert.equal(delegateCan(grant({ status: "something-else" }), "request_rides").allowed, false);
  assert.equal(delegateCan(grant({ endsAt: "2026-09-28T00:00:00Z" }), "request_rides").allowed, true);

  assert.equal(delegateGrantState({ status: "active", endsAt: "2026-09-01T00:00:00Z" }, NOW), "expired");
  assert.equal(delegateGrantState({ status: "active", startsAt: "2026-10-01T00:00:00Z" }, NOW), "not_started");
  assert.equal(delegateGrantState({ status: "paused" }, NOW), "paused");
  assert.equal(delegateGrantState({ status: "revoked", endsAt: null }, NOW), "revoked");
  assert.equal(delegateGrantState({ status: "active" }, NOW), "active");
});

test("child-limited grants only cover the named children", () => {
  const g = grant({ childScope: "selected", childIds: [CHILD] });
  assert.equal(delegateCan(g, "request_rides", { childId: CHILD }).allowed, true);
  assert.equal(delegateCan(g, "request_rides", { childId: OTHER_CHILD }).allowed, false);
  assert.equal(delegateCan(grant({ childScope: "selected", childIds: [] }), "request_rides").allowed, false);
  assert.equal(delegateCan(grant({ childScope: "weird", childIds: [CHILD] }), "request_rides").allowed, false);
});

test("children outside the household, adults, and other households are never covered", () => {
  assert.equal(delegateCan(grant({ childInHousehold: false }), "view_ride_details").allowed, false);
  assert.equal(delegateCan(grant({ childIsMinor: false }), "view_ride_details").allowed, false);
  assert.equal(delegateCan(grant({ householdActive: false }), "view_ride_details").allowed, false);
});

test("a delegate who is not an adult or whose account is inactive is denied", () => {
  assert.equal(delegateCan(grant({ delegateIsAdult: false }), "request_rides").allowed, false);
  assert.equal(delegateCan(grant({ delegateActive: false }), "request_rides").allowed, false);
});

test("an organization that turns delegates off blocks delegates but not guardians", () => {
  assert.equal(delegateCan(grant(), "request_rides", { organizationAllowsDelegates: false }).allowed, false);
  assert.equal(delegateCan(grant(), "request_rides", { organizationAllowsDelegates: true }).allowed, true);
  assert.equal(delegateCan(grant(), "request_rides", { organizationAllowsDelegates: null }).allowed, true);
  const guardian = evaluateChildAccess({
    actorIsChild: false,
    guardian: { canApproveRides: true, canManageProfile: true },
    delegates: [],
    childId: CHILD,
    action: "approve_rides",
    organizationAllowsDelegates: false,
    now: NOW,
  });
  assert.equal(guardian.allowed, true);
  assert.equal(guardian.via, "guardian");
});

test("guardian checks keep their existing meaning", () => {
  const onlyApprove = { canApproveRides: true, canManageProfile: false };
  const onlyProfile = { canApproveRides: false, canManageProfile: true };
  const check = (guardian: { canApproveRides: boolean; canManageProfile: boolean }, action: ChildAction) =>
    evaluateChildAccess({ actorIsChild: false, guardian, delegates: [], childId: CHILD, action, now: NOW }).allowed;
  assert.equal(check(onlyApprove, "approve_rides"), true);
  assert.equal(check(onlyApprove, "manage_ride_request"), true);
  assert.equal(check(onlyApprove, "request_rides"), false);
  assert.equal(check(onlyProfile, "request_rides"), true);
  assert.equal(check(onlyProfile, "approve_rides"), false);
  assert.equal(check(onlyProfile, "view_other_households"), false);
  // A guardian row that lacks a permission can still be covered by a delegate grant.
  const viaDelegate = evaluateChildAccess({ actorIsChild: false, guardian: onlyProfile, delegates: [grant()], childId: CHILD, action: "approve_rides", now: NOW });
  assert.equal(viaDelegate.via, "delegate");
});

test("a child can request and see their own rides but not approve or manage them", () => {
  const self = (action: ChildAction) => evaluateChildAccess({ actorIsChild: true, guardian: null, delegates: [], childId: CHILD, action, now: NOW }).allowed;
  assert.equal(self("request_rides"), true);
  assert.equal(self("view_ride_details"), true);
  assert.equal(self("approve_rides"), false);
  assert.equal(self("manage_ride_request"), false);
  assert.equal(self("edit_child_safety"), false);
});

test("strangers are denied", () => {
  const decision = evaluateChildAccess({ actorIsChild: false, guardian: null, delegates: [], childId: CHILD, action: "view_ride_details", now: NOW });
  assert.equal(decision.allowed, false);
  assert.equal(decision.via, null);
});

test("minors and unverified or inactive accounts cannot be delegates", () => {
  assert.equal(delegateEligibility({ personType: "minor", ageBand: "13_17", hasVerifiedContact: true }).eligible, false);
  assert.equal(delegateEligibility({ personType: "adult", ageBand: "13_17", hasVerifiedContact: true }).eligible, false);
  assert.equal(delegateEligibility({ personType: "adult", ageBand: "under_13", hasVerifiedContact: true }).eligible, false);
  assert.equal(delegateEligibility({ personType: null, hasVerifiedContact: true }).eligible, false);
  assert.match(String(delegateEligibility({ personType: "minor", hasVerifiedContact: true }).reason), /Only adults/);
  assert.equal(delegateEligibility({ personType: "adult", ageBand: "adult", hasVerifiedContact: false }).eligible, false);
  assert.equal(delegateEligibility({ personType: "adult", ageBand: "adult", accountStatus: "disabled", hasVerifiedContact: true }).eligible, false);
  assert.equal(delegateEligibility({ personType: "adult", ageBand: "adult", personStatus: "deleted", hasVerifiedContact: true }).eligible, false);
  assert.equal(delegateEligibility({ personType: "adult", ageBand: "adult", personStatus: "active", accountStatus: "active", hasVerifiedContact: true }).eligible, true);
  assert.equal(delegateEligibility({ personType: "adult", ageBand: "unknown", hasVerifiedContact: true }).eligible, true);
});

test("invites expire after 7 days and are single use", () => {
  assert.equal(DELEGATE_INVITE_TTL_DAYS, 7);
  const expires = delegateInviteExpiresAt(NOW);
  assert.equal(expires.getTime() - NOW.getTime(), 7 * 24 * 60 * 60 * 1000);
  assert.equal(delegateInviteState({ expiresAt: expires }, NOW), "active");
  assert.equal(delegateInviteState({ expiresAt: expires }, new Date(expires.getTime() + 1)), "expired");
  assert.equal(delegateInviteState({ expiresAt: expires }, expires), "expired");
  assert.equal(delegateInviteState({ expiresAt: expires, acceptedAt: NOW }, NOW), "accepted");
  assert.equal(delegateInviteState({ expiresAt: expires, revokedAt: NOW }, NOW), "revoked");
  assert.equal(delegateInviteState({ expiresAt: "not a date" }, NOW), "expired");
  // Once used, the invite never becomes usable again, even before expiry.
  assert.equal(delegateInviteAcceptError(delegateInviteState({ expiresAt: expires, acceptedAt: NOW }, NOW)), "This invitation was already used");
  assert.match(String(delegateInviteAcceptError("expired")), /expired/);
  assert.match(String(delegateInviteAcceptError("revoked")), /canceled/);
  assert.equal(delegateInviteAcceptError("active"), null);
});

test("invites are rate limited per inviter and per household", () => {
  assert.equal(delegateInviteRateLimitError({ inviterLastHour: 0, householdLastDay: 0 }), null);
  assert.equal(delegateInviteRateLimitError({ inviterLastHour: DELEGATE_INVITES_PER_INVITER_PER_HOUR - 1, householdLastDay: 0 }), null);
  assert.match(String(delegateInviteRateLimitError({ inviterLastHour: DELEGATE_INVITES_PER_INVITER_PER_HOUR, householdLastDay: 0 })), /Too many/);
  assert.match(String(delegateInviteRateLimitError({ inviterLastHour: 0, householdLastDay: DELEGATE_INVITES_PER_HOUSEHOLD_PER_DAY })), /Too many/);
});

test("invite tokens and contacts are validated", () => {
  assert.equal(looksLikeDelegateToken("a".repeat(43)), true);
  assert.equal(looksLikeDelegateToken("a".repeat(42)), false);
  assert.equal(looksLikeDelegateToken("a".repeat(42) + "!"), false);
  assert.equal(looksLikeDelegateToken(null), false);
  assert.equal(isValidDelegateEmail(" Grandma@Example.com "), true);
  assert.equal(isValidDelegateEmail("nope"), false);
  assert.equal(maskContact("email", "grandma@example.com"), "g***@example.com");
  assert.equal(maskContact("phone", "+15555550123"), "***-***-0123");
});

test("guardian choices are validated in plain English", () => {
  const kids = [CHILD, OTHER_CHILD];
  const scopes = parseDelegateScopes({ requestRides: true, approveRides: "yes" });
  assert.deepEqual(scopes, { requestRides: true, approveRides: false, viewRideDetails: false, receiveNotifications: false });
  assert.equal(delegateGrantInputError({ scopes, childScope: "all", childIds: [] }, kids, NOW), null);
  assert.match(String(delegateGrantInputError({ scopes: NONE, childScope: "all", childIds: [] }, kids, NOW)), /at least one thing/);
  assert.match(String(delegateGrantInputError({ scopes, childScope: "selected", childIds: [] }, kids, NOW)), /at least one child/);
  assert.match(String(delegateGrantInputError({ scopes, childScope: "selected", childIds: ["someone-else"] }, kids, NOW)), /in your household/);
  assert.equal(delegateGrantInputError({ scopes, childScope: "selected", childIds: [CHILD] }, kids, NOW), null);
  assert.match(String(delegateGrantInputError({ scopes, childScope: "everyone", childIds: [] }, kids, NOW)), /which children/);
  assert.match(String(delegateGrantInputError({ scopes, childScope: "all", childIds: [], endsAt: "2026-09-01T00:00:00Z" }, kids, NOW)), /future/);
  assert.match(String(delegateGrantInputError({ scopes, childScope: "all", childIds: [], endsAt: "garbage" }, kids, NOW)), /valid end date/);
  assert.equal(delegateGrantInputError({ scopes, childScope: "all", childIds: [], endsAt: "2026-12-01T00:00:00Z" }, kids, NOW), null);
  assert.match(String(delegateGrantInputError({ scopes, childScope: "all", childIds: [] }, [], NOW)), /Add a child/);
});

test("household delegate UI copy uses no em dashes", async () => {
  for (const file of [
    "../src/app/app/household/trusted-adults.tsx",
    "../src/app/household-invite/[token]/household-invite-accept.tsx",
    "../src/app/admin/household-delegates/page.tsx",
    "../src/lib/household-delegate-policy.ts",
    "../src/lib/household-delegates.ts",
    "../src/lib/child-access.ts",
  ]) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.equal(source.includes("—"), false, file);
  }
});

test("ride request and approval checks all go through canActForChild", async () => {
  const files = ["rides.ts", "carpool.ts", "ride-lifecycle.ts", "location-privacy.ts", "product.ts", "ride-waitlists.ts"];
  for (const name of files) {
    const source = await readFile(new URL(`../src/lib/${name}`, import.meta.url), "utf8");
    // Any "is this person a guardian of this child" lookup keyed by two parameters is an inline permission check.
    assert.equal(/guardian_relationships[\s\S]{0,80}?guardian_person_id\s*=\s*\$\d+\s+and\s+(gr\.)?minor_person_id\s*=\s*\$\d+/.test(source), false, `${name} still has an inline guardian check`);
    assert.ok(source.includes("canActForChild"), `${name} should use canActForChild`);
  }
});

test("a guardian can only grant permissions they hold for each covered child", () => {
  const kids = [{ id: CHILD, name: "Ava" }, { id: OTHER_CHILD, name: "Ben" }];
  const full = { guardian: true, requestRides: true, approveRides: true };
  const noApprove = { guardian: true, requestRides: true, approveRides: false };
  const noRequest = { guardian: true, requestRides: false, approveRides: true };
  const viewerOnly = { guardian: true, requestRides: false, approveRides: false };
  const approveOnly = { ...NONE, approveRides: true };
  const requestOnly = { ...NONE, requestRides: true };
  const viewOnly = { ...NONE, viewRideDetails: true, receiveNotifications: true };

  assert.equal(delegateGrantRightsError({ scopes: ALL, childScope: "all", childIds: [] }, kids, { [CHILD]: full, [OTHER_CHILD]: full }), null);
  assert.match(String(delegateGrantRightsError({ scopes: approveOnly, childScope: "all", childIds: [] }, kids, { [CHILD]: full, [OTHER_CHILD]: noApprove })), /cannot approve rides for Ben/);
  assert.match(String(delegateGrantRightsError({ scopes: requestOnly, childScope: "all", childIds: [] }, kids, { [CHILD]: noRequest, [OTHER_CHILD]: full })), /cannot ask for rides for Ava/);
  // Limiting the grant to the child they can approve for is fine.
  assert.equal(delegateGrantRightsError({ scopes: approveOnly, childScope: "selected", childIds: [CHILD] }, kids, { [CHILD]: full, [OTHER_CHILD]: noApprove }), null);
  // A household manager who is not this child's guardian cannot grant anything for them, not even viewing.
  assert.match(String(delegateGrantRightsError({ scopes: viewOnly, childScope: "all", childIds: [] }, kids, { [CHILD]: full })), /not a guardian of Ben/);
  assert.match(String(delegateGrantRightsError({ scopes: viewOnly, childScope: "all", childIds: [] }, kids, { [CHILD]: full, [OTHER_CHILD]: { guardian: false, requestRides: false, approveRides: false } })), /not a guardian of Ben/);
  // Viewing and notifications only need a guardian relationship.
  assert.equal(delegateGrantRightsError({ scopes: viewOnly, childScope: "all", childIds: [] }, kids, { [CHILD]: viewerOnly, [OTHER_CHILD]: viewerOnly }), null);
});

test("a paused or removed delegate cannot come back through an older invite", () => {
  const sent = "2026-09-20T12:00:00Z";
  const ok = { inviteCreatedAt: sent, inviterStillManages: true };
  assert.equal(delegateInviteAcceptBlock(ok), null);
  assert.equal(delegateInviteAcceptBlock({ ...ok, liveGrantStatus: "active" }), null);
  // Accepting never un-pauses a paused grant, no matter when the invite was sent.
  assert.match(String(delegateInviteAcceptBlock({ ...ok, liveGrantStatus: "paused", lastPausedAt: "2026-09-01T00:00:00Z" })), /paused/);
  // Paused (then resumed) or removed after the invite was sent: the invite is spent.
  assert.match(String(delegateInviteAcceptBlock({ ...ok, liveGrantStatus: "active", lastPausedAt: "2026-09-21T00:00:00Z" })), /new invitation/);
  assert.match(String(delegateInviteAcceptBlock({ ...ok, liveGrantStatus: null, lastRevokedAt: "2026-09-21T00:00:00Z" })), /new invitation/);
  assert.match(String(delegateInviteAcceptBlock({ ...ok, lastRevokedAt: sent })), /new invitation/);
  // Removed before a fresh invite was sent: the fresh invite works.
  assert.equal(delegateInviteAcceptBlock({ ...ok, liveGrantStatus: null, lastRevokedAt: "2026-09-10T00:00:00Z", lastPausedAt: "2026-09-05T00:00:00Z" }), null);
  // The inviter must still manage the household.
  assert.match(String(delegateInviteAcceptBlock({ ...ok, inviterStillManages: false })), /no longer manages/);
});

test("pausing, removing, and accepting cancel the person's other open invites", async () => {
  const source = await readFile(new URL("../src/lib/household-delegates.ts", import.meta.url), "utf8");
  const status = source.slice(source.indexOf("export async function setDelegateStatus"), source.indexOf("// Invitee side"));
  assert.match(status, /cancelOpenInvitesForPerson\(client/);
  assert.equal(/paused_at=case when \$2='paused' then now\(\) else null end/.test(status), false, "resuming must not erase when the grant was paused");
  const accept = source.slice(source.indexOf("export async function acceptDelegateInvitation"), source.indexOf("export async function leaveDelegation"));
  assert.match(accept, /delegateInviteAcceptBlock\(/);
  assert.match(accept, /cancelOpenInvitesForPerson\(client/);
  assert.match(accept, /delegateGrantRightsError\(/);
  assert.equal(/status='active',paused_at=null/.test(accept), false, "accepting must never un-pause a grant");
  for (const fn of ["export async function createDelegateInvitation", "export async function updateDelegate"]) {
    const start = source.indexOf(fn);
    assert.match(source.slice(start, start + 1500), /assertCanGrant\(identity\.personId/, fn);
  }
});
