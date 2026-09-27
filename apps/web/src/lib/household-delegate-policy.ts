// Pure rules for trusted household delegates and child-scoped permissions.
// No imports so node --test can load this file directly.
//
// Every ride request / approval check for a child goes through
// evaluateChildAccess (via canActForChild in child-access.ts), so guardians,
// delegates, and the child themself are judged by one set of rules.

export const DELEGATE_SCOPES = ["request_rides", "approve_rides", "view_ride_details", "receive_notifications"] as const;
export type DelegateScope = (typeof DELEGATE_SCOPES)[number];

/** Things a delegate can never do, whatever the guardian ticks. */
export const DELEGATE_FORBIDDEN_ACTIONS = [
  "manage_guardians",
  "manage_children",
  "edit_child_profile",
  "edit_child_safety",
  "manage_delegates",
  "view_other_households",
] as const;
export type DelegateForbiddenAction = (typeof DELEGATE_FORBIDDEN_ACTIONS)[number];

/**
 * request_rides        create a ride request for the child
 * approve_rides        approve or deny a ride request that needs guardian approval
 * manage_ride_request  act on an existing request or ride (accept a driver offer, cancel, set places, pool)
 * view_ride_details    see ride details and pickup information
 * receive_notifications get notified about the child's rides
 */
export type ChildAction = DelegateScope | "manage_ride_request" | DelegateForbiddenAction;

export const DELEGATE_SCOPE_LABELS: Record<DelegateScope, string> = {
  request_rides: "Ask for rides for the kids",
  approve_rides: "Approve or decline the kids' ride requests",
  view_ride_details: "See ride details and pickup information",
  receive_notifications: "Get notifications about the kids' rides",
};

export type DelegateScopes = {
  requestRides: boolean;
  approveRides: boolean;
  viewRideDetails: boolean;
  receiveNotifications: boolean;
};

export type DelegateGrantStatus = "active" | "paused" | "revoked";
export type DelegateGrantState = "active" | "paused" | "revoked" | "not_started" | "expired";

export type DelegateGrant = {
  id: string;
  status: DelegateGrantStatus | string;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  scopes: DelegateScopes;
  childScope: "all" | "selected" | string;
  /** Children named on the grant when childScope is "selected". */
  childIds: string[];
  /** Fresh facts about the delegate, the household, and the child. */
  delegateIsAdult: boolean;
  delegateActive: boolean;
  householdActive: boolean;
  childInHousehold: boolean;
  childIsMinor: boolean;
};

export type GuardianFacts = { canApproveRides: boolean; canManageProfile: boolean } | null;

export type ChildAccessDecision = {
  allowed: boolean;
  via: "self" | "guardian" | "delegate" | null;
  delegateId: string | null;
  reason: string;
};

function time(value: Date | string | null | undefined) {
  if (value == null || value === "") return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

export function isDelegateForbiddenAction(action: string): action is DelegateForbiddenAction {
  return (DELEGATE_FORBIDDEN_ACTIONS as readonly string[]).includes(action);
}

export function delegateGrantState(grant: Pick<DelegateGrant, "status" | "startsAt" | "endsAt">, now: Date = new Date()): DelegateGrantState {
  if (grant.status === "revoked") return "revoked";
  if (grant.status === "paused") return "paused";
  if (grant.status !== "active") return "revoked";
  const start = time(grant.startsAt);
  if (start != null && start > now.getTime()) return "not_started";
  const end = time(grant.endsAt);
  if (end != null && end <= now.getTime()) return "expired";
  return "active";
}

function scopeFor(action: ChildAction): keyof DelegateScopes | null {
  switch (action) {
    case "request_rides": return "requestRides";
    case "approve_rides": return "approveRides";
    // Acting on a request (accepting an offer, cancelling) follows from being allowed to ask for it.
    case "manage_ride_request": return "requestRides";
    case "view_ride_details": return "viewRideDetails";
    case "receive_notifications": return "receiveNotifications";
    default: return null;
  }
}

export function delegateGrantAllows(
  grant: DelegateGrant,
  childId: string,
  action: ChildAction,
  options: { now?: Date; organizationAllowsDelegates?: boolean | null } = {}
): { allowed: boolean; reason: string } {
  if (isDelegateForbiddenAction(action)) return { allowed: false, reason: "Delegates cannot do this" };
  const scope = scopeFor(action);
  if (!scope) return { allowed: false, reason: "Unknown action" };
  if (!grant.delegateActive) return { allowed: false, reason: "Delegate account is not active" };
  if (!grant.delegateIsAdult) return { allowed: false, reason: "Delegates must be adults" };
  if (!grant.householdActive) return { allowed: false, reason: "Household is not active" };
  if (!grant.childInHousehold || !grant.childIsMinor) return { allowed: false, reason: "This child is not covered by the delegate grant" };
  const state = delegateGrantState(grant, options.now);
  if (state !== "active") return { allowed: false, reason: `Delegate access is ${state.replace("_", " ")}` };
  if (grant.childScope !== "all") {
    if (grant.childScope !== "selected" || !grant.childIds.includes(childId)) {
      return { allowed: false, reason: "This child is not covered by the delegate grant" };
    }
  }
  if (options.organizationAllowsDelegates === false) return { allowed: false, reason: "This organization does not allow household delegates" };
  if (!grant.scopes[scope]) return { allowed: false, reason: "The guardian has not given this permission" };
  return { allowed: true, reason: "Delegate permission" };
}

function guardianAllows(guardian: NonNullable<GuardianFacts>, action: ChildAction) {
  switch (action) {
    // Matches the long-standing checks: requesting uses can_manage_profile,
    // approving and acting on requests use can_approve_rides.
    case "request_rides": return guardian.canManageProfile;
    case "approve_rides":
    case "manage_ride_request": return guardian.canApproveRides;
    case "view_ride_details":
    case "receive_notifications": return true;
    case "view_other_households": return false;
    default: return guardian.canManageProfile;
  }
}

/**
 * One decision for "may this person do this for this child". Order:
 * the child themself (only for requesting and viewing their own rides),
 * a guardian relationship, then any live delegate grant.
 */
export function evaluateChildAccess(input: {
  actorIsChild: boolean;
  guardian: GuardianFacts;
  delegates: DelegateGrant[];
  childId: string;
  action: ChildAction;
  organizationAllowsDelegates?: boolean | null;
  now?: Date;
}): ChildAccessDecision {
  if (input.actorIsChild && (input.action === "request_rides" || input.action === "view_ride_details" || input.action === "receive_notifications")) {
    return { allowed: true, via: "self", delegateId: null, reason: "Own rides" };
  }
  if (input.guardian && guardianAllows(input.guardian, input.action)) {
    return { allowed: true, via: "guardian", delegateId: null, reason: "Guardian permission" };
  }
  let reason = input.guardian ? "The guardian relationship does not include this permission" : "Not a guardian or delegate for this child";
  for (const grant of input.delegates) {
    const result = delegateGrantAllows(grant, input.childId, input.action, { now: input.now, organizationAllowsDelegates: input.organizationAllowsDelegates });
    if (result.allowed) return { allowed: true, via: "delegate", delegateId: grant.id, reason: result.reason };
    reason = result.reason;
  }
  return { allowed: false, via: null, delegateId: null, reason };
}

// ---------------------------------------------------------------------------
// Eligibility and invitations

/** Mirrors the adult check used for organization owners and admins, plus a verified account. */
export function delegateEligibility(person: {
  personType: string | null | undefined;
  ageBand?: string | null;
  personStatus?: string | null;
  accountStatus?: string | null;
  hasVerifiedContact: boolean;
}): { eligible: boolean; reason: string | null } {
  if (person.personType !== "adult" || person.ageBand === "13_17" || person.ageBand === "under_13") {
    return { eligible: false, reason: "Only adults can be trusted household members" };
  }
  if ((person.personStatus ?? "active") !== "active" || (person.accountStatus ?? "active") !== "active") {
    return { eligible: false, reason: "This account is not active" };
  }
  if (!person.hasVerifiedContact) return { eligible: false, reason: "Verify your email or phone before accepting" };
  return { eligible: true, reason: null };
}

export const DELEGATE_INVITE_TTL_DAYS = 7;
export const DELEGATE_INVITES_PER_INVITER_PER_HOUR = 10;
export const DELEGATE_INVITES_PER_HOUSEHOLD_PER_DAY = 20;

export function delegateInviteExpiresAt(now: Date = new Date()) {
  return new Date(now.getTime() + DELEGATE_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export type DelegateInviteState = "active" | "accepted" | "revoked" | "expired";

export function delegateInviteState(
  invite: { expiresAt: Date | string; acceptedAt?: Date | string | null; revokedAt?: Date | string | null },
  now: Date = new Date()
): DelegateInviteState {
  if (invite.acceptedAt) return "accepted";
  if (invite.revokedAt) return "revoked";
  const expires = time(invite.expiresAt);
  if (expires == null || expires <= now.getTime()) return "expired";
  return "active";
}

/** Plain-English error when an invite cannot be accepted, or null when it can. */
export function delegateInviteAcceptError(state: DelegateInviteState) {
  if (state === "accepted") return "This invitation was already used";
  if (state === "revoked") return "This invitation was canceled. Ask for a new one.";
  if (state === "expired") return "This invitation has expired. Ask for a new one.";
  return null;
}

export function delegateInviteRateLimitError(counts: { inviterLastHour: number; householdLastDay: number }) {
  if (counts.inviterLastHour >= DELEGATE_INVITES_PER_INVITER_PER_HOUR || counts.householdLastDay >= DELEGATE_INVITES_PER_HOUSEHOLD_PER_DAY) {
    return "Too many invitations sent recently. Try again later.";
  }
  return null;
}

/** Tokens are 32 random bytes as base64url (43 characters). */
export function looksLikeDelegateToken(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function normalizeDelegateEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function isValidDelegateEmail(value: unknown) {
  const email = normalizeDelegateEmail(value);
  return email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function parseDelegateScopes(input: Record<string, unknown> | null | undefined): DelegateScopes {
  const source = input || {};
  return {
    requestRides: source.requestRides === true,
    approveRides: source.approveRides === true,
    viewRideDetails: source.viewRideDetails === true,
    receiveNotifications: source.receiveNotifications === true,
  };
}

/**
 * Validate what a guardian chose. Returns a plain-English error or null.
 * householdChildIds are the minors in the guardian's household.
 */
export function delegateGrantInputError(
  input: { scopes: DelegateScopes; childScope: unknown; childIds: unknown; endsAt?: unknown },
  householdChildIds: string[],
  now: Date = new Date()
) {
  const scopes = input.scopes;
  if (!scopes.requestRides && !scopes.approveRides && !scopes.viewRideDetails && !scopes.receiveNotifications) {
    return "Choose at least one thing this person can do";
  }
  if (!householdChildIds.length) return "Add a child to your household first";
  if (input.childScope !== "all" && input.childScope !== "selected") return "Choose which children this covers";
  if (input.childScope === "selected") {
    const ids = Array.isArray(input.childIds) ? input.childIds.map(String) : [];
    if (!ids.length) return "Choose at least one child";
    if (ids.some(id => !householdChildIds.includes(id))) return "You can only choose children in your household";
  }
  if (input.endsAt != null && input.endsAt !== "") {
    const end = time(input.endsAt as string);
    if (end == null) return "Enter a valid end date";
    if (end <= now.getTime()) return "The end date must be in the future";
  }
  return null;
}

export function maskContact(contactType: "email" | "phone", value: string) {
  if (contactType === "email") {
    const [local, domain] = value.split("@");
    if (!domain) return "***";
    return `${local.slice(0, 1)}***@${domain}`;
  }
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 ? `***-***-${digits.slice(-4)}` : "***";
}

// ---------------------------------------------------------------------------
// What a guardian may hand out, and when an invite can no longer be used.

/** The inviter's own rights for one child, as a guardian (never through their own delegate grant). */
export type GuardianGrantRights = { guardian: boolean; requestRides: boolean; approveRides: boolean };

/**
 * A guardian can only give permissions they hold themselves, for each child
 * the grant covers. Returns a plain-English error or null.
 */
export function delegateGrantRightsError(
  input: { scopes: DelegateScopes; childScope: unknown; childIds: string[] },
  householdChildren: Array<{ id: string; name: string }>,
  rights: Record<string, GuardianGrantRights | undefined>
) {
  const covered = input.childScope === "selected"
    ? householdChildren.filter(child => input.childIds.includes(child.id))
    : householdChildren;
  const problems: string[] = [];
  for (const child of covered) {
    const r = rights[child.id];
    if (!r || !r.guardian) { problems.push(`you are not a guardian of ${child.name}`); continue; }
    if (input.scopes.requestRides && !r.requestRides) problems.push(`you cannot ask for rides for ${child.name}`);
    if (input.scopes.approveRides && !r.approveRides) problems.push(`you cannot approve rides for ${child.name}`);
  }
  if (!problems.length) return null;
  return `You can only give permissions you have yourself: ${problems.join("; ")}. Choose only those children or turn off that permission.`;
}

/**
 * Extra checks when an invite is accepted. A paused grant is never turned
 * back on by an invite, and a grant paused or removed after the invite was
 * sent makes the invite unusable. The inviter must still manage the household.
 */
export function delegateInviteAcceptBlock(input: {
  inviteCreatedAt: Date | string;
  inviterStillManages: boolean;
  liveGrantStatus?: string | null;
  lastPausedAt?: Date | string | null;
  lastRevokedAt?: Date | string | null;
}) {
  if (!input.inviterStillManages) return "The person who invited you no longer manages this household. Ask for a new invitation.";
  if (input.liveGrantStatus === "paused") return "Your access to this family is paused. Ask the parent to turn it back on.";
  const created = time(input.inviteCreatedAt) ?? 0;
  const paused = time(input.lastPausedAt);
  const revoked = time(input.lastRevokedAt);
  if ((paused != null && paused >= created) || (revoked != null && revoked >= created)) {
    return "Your access was changed after this invitation was sent. Ask the parent for a new invitation.";
  }
  return null;
}
