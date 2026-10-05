import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DELEGATE_FORBIDDEN_ACTIONS,
  DELEGATE_ORGANIZATION_REQUIRED,
  DELEGATE_OWN_REQUEST_FIELDS,
  delegateInviteIsSelf,
  delegateRequestView,
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
    // Inside an organization that allows delegates, unless the test says otherwise.
    organizationAllowsDelegates: "organizationAllowsDelegates" in options ? options.organizationAllowsDelegates : true,
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
    assert.equal(delegateGrantAllows(grant(), CHILD, action, { now: NOW, organizationAllowsDelegates: true }).reason, "Delegates cannot do this");
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
  const viaDelegate = evaluateChildAccess({ actorIsChild: false, guardian: onlyProfile, delegates: [grant()], childId: CHILD, action: "approve_rides", organizationAllowsDelegates: true, now: NOW });
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

test("a delegate grant is refused when the organization setting was not checked", () => {
  const actions: ChildAction[] = ["request_rides", "approve_rides", "manage_ride_request", "view_ride_details", "receive_notifications"];
  for (const action of actions) {
    // No organization passed: canActForChild hands the policy null (or nothing at all).
    for (const unchecked of [null, undefined]) {
      const decision = delegateCan(grant(), action, { organizationAllowsDelegates: unchecked });
      assert.equal(decision.allowed, false, `${action} with ${unchecked}`);
      assert.equal(decision.via, null);
      assert.equal(decision.reason, DELEGATE_ORGANIZATION_REQUIRED);
    }
    assert.equal(evaluateChildAccess({ actorIsChild: false, guardian: null, delegates: [grant()], childId: CHILD, action, now: NOW }).allowed, false, `${action} with the option left out`);
    assert.equal(delegateGrantAllows(grant(), CHILD, action, { now: NOW }).allowed, false, action);
    assert.equal(delegateCan(grant(), action, { organizationAllowsDelegates: true }).allowed, true, action);
  }
  assert.equal(delegateCan(grant(), "request_rides", { organizationAllowsDelegates: false }).reason, "This organization does not allow household delegates");
});

test("guardians and the child are not affected by a missing organization", () => {
  const guardian = evaluateChildAccess({ actorIsChild: false, guardian: { canApproveRides: true, canManageProfile: true }, delegates: [grant()], childId: CHILD, action: "approve_rides", now: NOW });
  assert.equal(guardian.allowed, true);
  assert.equal(guardian.via, "guardian");
  const self = evaluateChildAccess({ actorIsChild: true, guardian: null, delegates: [], childId: CHILD, action: "request_rides", now: NOW });
  assert.equal(self.via, "self");
  // A guardian row without the needed right does not fall through to a delegate grant when no organization was checked.
  const partial = evaluateChildAccess({ actorIsChild: false, guardian: { canApproveRides: false, canManageProfile: true }, delegates: [grant()], childId: CHILD, action: "approve_rides", now: NOW });
  assert.equal(partial.allowed, false);
});

test("canActForChild never skips the organization setting", async () => {
  const access = await readFile(new URL("../src/lib/child-access.ts", import.meta.url), "utf8");
  // No organization means "not checked" (null), and the policy refuses delegates on anything but true.
  assert.match(access, /if \(!organizationId\) return null;/);
  assert.match(access, /organizationAllowsDelegates: orgAllows,/);
  const policy = await readFile(new URL("../src/lib/household-delegate-policy.ts", import.meta.url), "utf8");
  assert.match(policy, /if \(options\.organizationAllowsDelegates !== true\) return \{ allowed: false, reason: DELEGATE_ORGANIZATION_REQUIRED \};/);
  // Every caller outside the grant-rights check passes an organization.
  const delegates = await readFile(new URL("../src/lib/household-delegates.ts", import.meta.url), "utf8");
  const calls = [...delegates.matchAll(/canActForChild\(([^\n]*)\)/g)].map((match) => match[1]);
  const withoutOrganization = calls.filter((call) => !call.includes("organizationId"));
  assert.equal(withoutOrganization.length, 3, "only guardianGrantRights calls without an organization");
  for (const call of withoutOrganization) assert.match(call, /^personId, childId, "(request_rides|approve_rides|view_ride_details)"$/);
  assert.match(delegates, /request\.via === "guardian"/);
});

const REQUEST_ROW = {
  id: "request-1",
  public_ref: "ABCD1234",
  organization_id: "org-1",
  organization_name: "Marching Band",
  requester_person_id: "delegate-1",
  status: "open",
  direction: "to_event",
  guardian_approval_status: "not_required",
  requested_pickup_at: "2026-10-09T22:00:00Z",
  pickup_note: "Side door, ring twice",
  pickup_area: "Near Maple and 3rd",
  event_title: "Friday Night Game",
  event_starts_at: "2026-10-09T23:00:00Z",
  offers: [{ id: "offer-1", driverName: "Pat Driver", seatsOffered: 2, proposedPickupAt: null }],
};

test("a request-only delegate sees the requests they created, with only the short status view", () => {
  const view = delegateRequestView({ request: REQUEST_ROW, viewAllowed: false, manageAllowed: true, createdByViewer: true });
  assert.ok(view, "their own request is listed");
  assert.equal(view.limitedView, true);
  assert.equal(view.status, "open");
  assert.equal(view.event_title, "Friday Night Game");
  assert.equal(view.canManage, true);
  // Nothing beyond the short list of fields.
  assert.deepEqual(Object.keys(view).sort(), [...DELEGATE_OWN_REQUEST_FIELDS, "canManage", "limitedView", "offerCount", "offers"].sort());
  for (const hidden of ["pickup_note", "pickup_area", "requester_person_id"]) assert.equal(hidden in view, false, hidden);
  assert.deepEqual(view.offers, []);
  assert.equal(view.offerCount, 1);
  assert.doesNotMatch(JSON.stringify(view), /Pat Driver|Side door|Maple/);
});

test("the short view does not widen access to anyone else's requests", () => {
  // Someone else created it (a parent, or another trusted adult): still hidden without "See ride details".
  assert.equal(delegateRequestView({ request: REQUEST_ROW, viewAllowed: false, manageAllowed: true, createdByViewer: false }), null);
  // Their own request, but they can no longer ask for rides (scope removed, grant paused, or delegates turned off).
  assert.equal(delegateRequestView({ request: REQUEST_ROW, viewAllowed: false, manageAllowed: false, createdByViewer: true }), null);
  assert.equal(delegateRequestView({ request: REQUEST_ROW, viewAllowed: false, manageAllowed: false, createdByViewer: false }), null);
});

test("delegates with See Ride Details keep the full view, and nobody is sent the creator's id", () => {
  const full = delegateRequestView({ request: REQUEST_ROW, viewAllowed: true, manageAllowed: true, createdByViewer: false });
  assert.ok(full);
  assert.equal(full.pickup_note, "Side door, ring twice");
  assert.equal(full.pickup_area, "Near Maple and 3rd");
  assert.equal(full.limitedView, undefined);
  assert.deepEqual(full.offers, REQUEST_ROW.offers);
  assert.equal("requester_person_id" in full, false);
  // View without the right to act: details yes, offers no (unchanged rule).
  const viewOnly = delegateRequestView({ request: REQUEST_ROW, viewAllowed: true, manageAllowed: false, createdByViewer: false });
  assert.ok(viewOnly);
  assert.equal(viewOnly.canManage, false);
  assert.deepEqual(viewOnly.offers, []);
});

test("the delegate overview uses the request view rule for every request", async () => {
  const delegates = await readFile(new URL("../src/lib/household-delegates.ts", import.meta.url), "utf8");
  assert.match(delegates, /select rr\.id,rr\.public_ref,rr\.organization_id,rr\.requester_person_id,/);
  assert.match(delegates, /createdByViewer: String\(requesterPersonId\) === identity\.personId,/);
  assert.match(delegates, /const shown = delegateRequestView\(\{/);
  assert.doesNotMatch(delegates, /if \(view\.allowed\) entry\.requests\.push/);
  // The ride list (driver, vehicle, pickup area) still needs "See ride details".
  assert.match(delegates, /if \(!view\.allowed\) continue;/);
});

test("you cannot invite your own email or your own phone number", () => {
  const own = { ownEmails: ["parent@example.org"], ownPhoneLookupHashes: ["hash-of-my-phone", "hash-of-my-old-phone"] };
  assert.equal(delegateInviteIsSelf({ contactType: "phone", phoneLookupHash: "hash-of-my-phone", ...own }), true);
  assert.equal(delegateInviteIsSelf({ contactType: "phone", phoneLookupHash: "hash-of-my-old-phone", ...own }), true);
  assert.equal(delegateInviteIsSelf({ contactType: "phone", phoneLookupHash: "hash-of-grandma", ...own }), false);
  assert.equal(delegateInviteIsSelf({ contactType: "email", normalizedEmail: "parent@example.org", ...own }), true);
  assert.equal(delegateInviteIsSelf({ contactType: "email", normalizedEmail: " Parent@Example.org ", ...own }), true);
  assert.equal(delegateInviteIsSelf({ contactType: "email", normalizedEmail: "grandma@example.org", ...own }), false);
  // A missing value never matches.
  assert.equal(delegateInviteIsSelf({ contactType: "phone", phoneLookupHash: null, ...own }), false);
  assert.equal(delegateInviteIsSelf({ contactType: "phone", phoneLookupHash: "hash-of-my-phone", ownEmails: [], ownPhoneLookupHashes: [] }), false);
  assert.equal(delegateInviteIsSelf({ contactType: "letter", normalizedEmail: "parent@example.org", ...own }), false);
});

test("creating an invitation checks the inviter's own phone before saving anything", async () => {
  const delegates = await readFile(new URL("../src/lib/household-delegates.ts", import.meta.url), "utf8");
  const create = delegates.slice(delegates.indexOf("export async function createDelegateInvitation"), delegates.indexOf("export async function cancelDelegateInvitation"));
  const phoneBranch = create.slice(create.indexOf('input.contactType === "phone"'));
  const check = phoneBranch.indexOf('delegateInviteIsSelf({ contactType: "phone", phoneLookupHash: phoneHash,');
  assert.ok(check > 0, "the phone branch checks for a self-invite");
  assert.ok(check < phoneBranch.indexOf("insert into household_delegate_invitations"), "the check runs before the invitation is saved");
  assert.match(phoneBranch.slice(check, check + 300), /throw new Error\("You cannot invite yourself"\)/);
  assert.match(create, /delegateInviteIsSelf\(\{ contactType: "email", normalizedEmail,/);
});
