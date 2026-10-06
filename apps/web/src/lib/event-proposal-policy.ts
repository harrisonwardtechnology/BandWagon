// Pure rules for moderated member event proposals. No imports: exercised
// directly by node --test.
//
// Members never publish events directly. An adult member (or a guardian, when
// the organization chooses that) submits a proposal, and an organization
// owner, admin, or manager approves it, asks for changes, or declines it.
// Approval creates the event through the same code path as manual events.

export const EVENT_PROPOSAL_STATUSES = ["pending", "changes_requested", "approved", "declined", "withdrawn"] as const;
export type EventProposalStatus = (typeof EVENT_PROPOSAL_STATUSES)[number];

export const PROPOSER_SCOPES = ["adult_members", "guardians_only"] as const;
export type ProposerScope = (typeof PROPOSER_SCOPES)[number];
export const DEFAULT_PROPOSER_SCOPE: ProposerScope = "adult_members";

export const MODERATOR_ROLES = ["owner", "admin", "manager"] as const;
export const SETTINGS_ROLES = ["owner", "admin"] as const;

export const PROPOSAL_LIMITS = {
  title: 120,
  description: 2000,
  locationName: 160,
  locationAddress: 300,
  notes: 1000,
  moderatorNote: 1000,
  expectedRidersMax: 500,
  maxDaysAhead: 400,
  maxDurationHours: 72,
} as const;

/** Submissions allowed per member per organization in a rolling 24 hours. */
export const PROPOSALS_PER_DAY = 3;
/** Open (pending or changes requested) proposals a member may have at once. */
export const OPEN_PROPOSALS_MAX = 5;

export type ProposalAction = "submit" | "resubmit" | "withdraw" | "approve" | "request_changes" | "decline";

const TRANSITIONS: Record<EventProposalStatus, Partial<Record<ProposalAction, EventProposalStatus>>> = {
  pending: { approve: "approved", request_changes: "changes_requested", decline: "declined", withdraw: "withdrawn" },
  changes_requested: { resubmit: "pending", decline: "declined", withdraw: "withdrawn" },
  approved: {},
  declined: {},
  withdrawn: {},
};

export function isEventProposalStatus(value: unknown): value is EventProposalStatus {
  return EVENT_PROPOSAL_STATUSES.includes(value as EventProposalStatus);
}

export function nextProposalStatus(current: unknown, action: ProposalAction): EventProposalStatus | null {
  if (!isEventProposalStatus(current)) return null;
  return TRANSITIONS[current][action] ?? null;
}

export function assertProposalTransition(current: unknown, action: ProposalAction): EventProposalStatus {
  const next = nextProposalStatus(current, action);
  if (!next) {
    const label = isEventProposalStatus(current) ? current.replaceAll("_", " ") : "unknown";
    throw new Error(`This proposal is ${label} and can no longer be changed that way`);
  }
  return next;
}

export function isOpenProposalStatus(status: unknown) {
  return status === "pending" || status === "changes_requested";
}

export function proposerScope(value: unknown): ProposerScope {
  return PROPOSER_SCOPES.includes(value as ProposerScope) ? (value as ProposerScope) : DEFAULT_PROPOSER_SCOPE;
}

export function canModerateProposals(role: unknown, platformAccess = false) {
  return platformAccess || MODERATOR_ROLES.includes(role as (typeof MODERATOR_ROLES)[number]);
}

export function canManageProposalSettings(role: unknown, platformAccess = false) {
  return platformAccess || SETTINGS_ROLES.includes(role as (typeof SETTINGS_ROLES)[number]);
}

// ---------------------------------------------------------------------------
// Stale proposals: a start time that has passed, or a queue left behind when
// the feature is turned off.

export const PAST_PROPOSAL_APPROVE_MESSAGE =
  "This proposal's start time has already passed. Change the date and time to approve it, or decline it.";
export const PROPOSALS_OFF_REVIEW_MESSAGE =
  "Event proposals are turned off for this organization, so this proposal is on hold. Turn proposals back on to approve it or ask for changes, or decline it now.";

/** True when the start time is a real date that is not in the future. */
export function proposalStartHasPassed(startsAt: unknown, now = new Date()) {
  if (startsAt == null || startsAt === "") return false;
  const time = (startsAt instanceof Date ? startsAt : new Date(String(startsAt))).getTime();
  return Number.isFinite(time) && time <= now.getTime();
}

/**
 * Why a review action is refused right now, or null when it may go ahead.
 * - Declining always works, so a queue can be cleared at any time.
 * - While proposals are turned off, queued proposals are on hold: nothing is
 *   published and nobody is asked to resend. Nothing is deleted or changed.
 * - Approving needs a start time in the future. startsAt is the time that
 *   would be published (the moderator's edit when there is one).
 */
export function proposalModerationBlock(input: {
  action: "approve" | "request_changes" | "decline";
  moduleEnabled: boolean;
  startsAt: unknown;
  now?: Date;
}): string | null {
  if (input.action === "decline") return null;
  if (!input.moduleEnabled) return PROPOSALS_OFF_REVIEW_MESSAGE;
  if (input.action === "approve" && proposalStartHasPassed(input.startsAt, input.now)) return PAST_PROPOSAL_APPROVE_MESSAGE;
  return null;
}

/** Shown to the admin who turns proposals off while some are still queued. Null when the queue is empty. */
export function proposalsOffNotice(openCount: number) {
  if (!Number.isFinite(openCount) || openCount <= 0) return null;
  const queued = openCount === 1 ? "1 proposal is still in the queue. It's on hold, not deleted" : `${openCount} proposals are still in the queue. They're on hold, not deleted`;
  return `Event proposals are off. ${queued}: decline now, or turn proposals back on to approve or ask for changes.`;
}

/**
 * Why this person may not submit a proposal right now, or null when they may.
 * Minors are always refused. Support View sessions never submit.
 */
export function proposalSubmitDenial(input: {
  moduleEnabled: boolean;
  scope: unknown;
  personType: unknown;
  isActiveMember: boolean;
  isGuardianInOrganization: boolean;
  supportMode?: boolean;
  submittedLast24h?: number;
  openCount?: number;
  resubmitting?: boolean;
}): string | null {
  if (input.supportMode) return "Event proposals cannot be sent from Support View";
  if (!input.moduleEnabled) return "This organization is not accepting event proposals";
  if (!input.isActiveMember) return "Only active members of this organization can propose events";
  if (input.personType !== "adult") return "Only adults can propose events. A parent or guardian can propose one instead";
  if (proposerScope(input.scope) === "guardians_only" && !input.isGuardianInOrganization) {
    return "This organization only accepts event proposals from parents and guardians";
  }
  if (!input.resubmitting) {
    if ((input.submittedLast24h ?? 0) >= PROPOSALS_PER_DAY) {
      return `You can send up to ${PROPOSALS_PER_DAY} event proposals a day. Please try again tomorrow`;
    }
    if ((input.openCount ?? 0) >= OPEN_PROPOSALS_MAX) {
      return `You already have ${OPEN_PROPOSALS_MAX} proposals waiting for review. Please wait for a decision first`;
    }
  }
  return null;
}

/** Removes HTML tags and control characters. Keeps line breaks when multiline. */
export function stripHtml(value: unknown, options: { multiline?: boolean } = {}) {
  let text = String(value ?? "");
  text = text.replace(/<!--[\s\S]*?-->/g, " ");
  text = text.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, " ");
  text = text.replace(/<\/?[a-z!][^>]*>/gi, " ");
  text = text.replace(/[<>]/g, " ");
  text = text.replace(/\r\n?/g, "\n");
  if (options.multiline) {
    text = text.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ");
    text = text
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n");
  } else {
    text = text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ");
  }
  return text.trim();
}

function cleanField(value: unknown, label: string, max: number, options: { required?: boolean; multiline?: boolean } = {}) {
  const text = stripHtml(value, { multiline: options.multiline });
  if (!text) {
    if (options.required) throw new Error(`${label} is required`);
    return null;
  }
  if (text.length > max) throw new Error(`${label} must be ${max} characters or fewer`);
  return text;
}

export type ProposalFields = {
  title: string;
  description: string | null;
  locationName: string | null;
  locationAddress: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  expectedRiders: number | null;
  notes: string | null;
};

/** Validates and cleans member input. Throws a plain-English error. */
export function validateProposalInput(input: Record<string, unknown>, now = new Date()): ProposalFields {
  const title = cleanField(input.title, "Event name", PROPOSAL_LIMITS.title, { required: true })!;
  const description = cleanField(input.description, "Description", PROPOSAL_LIMITS.description, { multiline: true });
  const locationName = cleanField(input.locationName, "Location name", PROPOSAL_LIMITS.locationName);
  const locationAddress = cleanField(input.locationAddress, "Address", PROPOSAL_LIMITS.locationAddress);
  const notes = cleanField(input.notes, "Notes for organizers", PROPOSAL_LIMITS.notes, { multiline: true });

  if (!input.startsAt) throw new Error("Start date and time are required");
  const starts = new Date(String(input.startsAt));
  if (!Number.isFinite(starts.getTime())) throw new Error("Enter a valid start date and time");
  if (starts.getTime() <= now.getTime()) throw new Error("The event must start in the future");
  if (starts.getTime() > now.getTime() + PROPOSAL_LIMITS.maxDaysAhead * 86_400_000) {
    throw new Error(`Events can be proposed up to ${PROPOSAL_LIMITS.maxDaysAhead} days ahead`);
  }
  let endsAt: string | null = null;
  if (input.endsAt) {
    const ends = new Date(String(input.endsAt));
    if (!Number.isFinite(ends.getTime())) throw new Error("Enter a valid end date and time");
    if (ends.getTime() <= starts.getTime()) throw new Error("The end time must be after the start time");
    if (ends.getTime() - starts.getTime() > PROPOSAL_LIMITS.maxDurationHours * 3_600_000) {
      throw new Error(`Events can last up to ${PROPOSAL_LIMITS.maxDurationHours} hours`);
    }
    endsAt = ends.toISOString();
  }

  let expectedRiders: number | null = null;
  if (input.expectedRiders !== undefined && input.expectedRiders !== null && input.expectedRiders !== "") {
    const n = Number(input.expectedRiders);
    if (!Number.isInteger(n) || n < 0 || n > PROPOSAL_LIMITS.expectedRidersMax) {
      throw new Error(`Expected riders must be a whole number from 0 to ${PROPOSAL_LIMITS.expectedRidersMax}`);
    }
    expectedRiders = n;
  }

  return {
    title,
    description,
    locationName,
    locationAddress,
    startsAt: starts.toISOString(),
    endsAt,
    allDay: input.allDay === true,
    expectedRiders,
    notes,
  };
}

/** A moderator note is required to decline or ask for changes. */
export function validateModeratorNote(value: unknown, action: "request_changes" | "decline") {
  const note = cleanField(value, action === "decline" ? "Reason" : "Note to the proposer", PROPOSAL_LIMITS.moderatorNote, { multiline: true });
  if (!note) throw new Error(action === "decline" ? "Add a short reason for declining" : "Tell the proposer what to change");
  return note;
}

/**
 * Builds the input for createManualEvent when a moderator approves a proposal.
 * Moderator edits win over the proposal. The proposer is credited, and the
 * moderator is recorded as the person who published the event.
 */
export function approvedEventInput(input: {
  organizationId: string;
  proposal: ProposalFields & { proposerPersonId: string | null };
  edits?: Partial<ProposalFields>;
  visibility?: unknown;
  rideCoordinationEnabled?: unknown;
  moderatorPersonId: string;
}) {
  const merged = { ...input.proposal, ...Object.fromEntries(Object.entries(input.edits || {}).filter(([, v]) => v !== undefined)) };
  return {
    organizationId: input.organizationId,
    title: merged.title,
    description: merged.description,
    locationName: merged.locationName,
    locationAddress: merged.locationAddress,
    startsAt: merged.startsAt,
    endsAt: merged.endsAt,
    allDay: Boolean(merged.allDay),
    visibility: (input.visibility === "private" ? "private" : "organization") as "organization" | "private",
    rideCoordinationEnabled: input.rideCoordinationEnabled !== false,
    createdByPersonId: input.moderatorPersonId,
    proposedByPersonId: input.proposal.proposerPersonId,
  };
}

export function proposalStatusLabel(status: unknown) {
  switch (status) {
    case "pending": return "Waiting for review";
    case "changes_requested": return "Changes requested";
    case "approved": return "Approved and published";
    case "declined": return "Declined";
    case "withdrawn": return "Withdrawn";
    default: return "Unknown";
  }
}
