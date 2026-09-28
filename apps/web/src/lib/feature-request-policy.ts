// Pure feature request rules. No imports: exercised directly by node --test.
//
// Feature ideas come from families, drivers, students, and organization admins.
// Minors use BandWagon, so everything here is plain text only: HTML is removed,
// links are never turned into anchors, and lengths are capped.

export const FEATURE_REQUEST_CATEGORIES = {
  rides: "Rides",
  events: "Events",
  messaging: "Messaging and notifications",
  safety: "Safety",
  accessibility: "Accessibility",
  admin: "Organization admin tools",
  other: "Something else",
} as const;
export type FeatureRequestCategory = keyof typeof FEATURE_REQUEST_CATEGORIES;

export const FEATURE_REQUEST_STATUSES = {
  new: "New",
  under_review: "Under review",
  planned: "Planned",
  in_progress: "In progress",
  shipped: "Shipped",
  declined: "Not planned",
  duplicate: "Duplicate",
} as const;
export type FeatureRequestStatus = keyof typeof FEATURE_REQUEST_STATUSES;

/** Statuses every signed-in person can browse and vote on. */
export const PUBLIC_FEATURE_REQUEST_STATUSES: FeatureRequestStatus[] = ["under_review", "planned", "in_progress", "shipped"];
/** Statuses that can still collect votes. */
export const VOTABLE_FEATURE_REQUEST_STATUSES: FeatureRequestStatus[] = ["under_review", "planned", "in_progress"];
/** Status changes that email the submitter (best effort). */
export const NOTIFY_ON_STATUSES: FeatureRequestStatus[] = ["planned", "shipped", "declined"];

export const FEATURE_REQUEST_LIMITS = {
  titleMin: 5,
  titleMax: 120,
  detailsMin: 10,
  detailsMax: 4000,
  publicNoteMax: 1000,
  email: 320,
} as const;

/** Per-hour rate limits. Signed-out submitters are held to a tighter limit. */
export const FEATURE_REQUEST_RATE_LIMITS = {
  submitPerIp: 10,
  submitPerPerson: 5,
  submitPerEmail: 3,
  votePerPerson: 60,
} as const;

// Allowed transitions. "new" is only the starting point; nothing moves back to it.
const TRANSITIONS: Record<FeatureRequestStatus, FeatureRequestStatus[]> = {
  new: ["under_review", "planned", "in_progress", "shipped", "declined", "duplicate"],
  under_review: ["planned", "in_progress", "shipped", "declined", "duplicate"],
  planned: ["under_review", "in_progress", "shipped", "declined", "duplicate"],
  in_progress: ["planned", "shipped", "declined"],
  shipped: ["in_progress"],
  declined: ["under_review", "planned"],
  duplicate: ["under_review"],
};

export function isFeatureRequestStatus(value: unknown): value is FeatureRequestStatus {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(FEATURE_REQUEST_STATUSES, value);
}
export function isFeatureRequestCategory(value: unknown): value is FeatureRequestCategory {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(FEATURE_REQUEST_CATEGORIES, value);
}

/**
 * Plain text only. Removes HTML tags and control characters, collapses runs of
 * spaces, and trims. Line breaks survive when multiline is true so details stay
 * readable; the UI renders the result as text, never as HTML.
 */
export function plainText(value: unknown, max: number, multiline = false) {
  let text = String(value ?? "");
  text = text.replace(/<\/?[a-z!][^>]*>/gi, " ").replace(/[<>]/g, "");
  text = multiline
    ? text.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n")
    : text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ");
  text = text.split("\n").map((line) => line.trim()).join("\n").trim();
  return text.slice(0, max).trim();
}

export function validEmail(value: string) {
  return value.length <= FEATURE_REQUEST_LIMITS.email && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
}

function linkCount(text: string) {
  return (text.match(/\b(?:https?:\/\/|www\.)/gi) || []).length;
}

export type FeatureRequestInput = { title: string; details: string; category: FeatureRequestCategory; email: string | null };

export function validateFeatureRequest(body: any, options: { signedIn: boolean }):
  | { ok: true; value: FeatureRequestInput }
  | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const title = plainText(body?.title, FEATURE_REQUEST_LIMITS.titleMax + 1);
  const details = plainText(body?.details, FEATURE_REQUEST_LIMITS.detailsMax + 1, true);
  const category = String(body?.category ?? "other");
  const email = options.signedIn ? null : plainText(body?.email, FEATURE_REQUEST_LIMITS.email + 1).toLowerCase();

  if (title.length < FEATURE_REQUEST_LIMITS.titleMin) errors.title = `Give your idea a short title (at least ${FEATURE_REQUEST_LIMITS.titleMin} characters).`;
  else if (title.length > FEATURE_REQUEST_LIMITS.titleMax) errors.title = `Keep the title to ${FEATURE_REQUEST_LIMITS.titleMax} characters or fewer.`;
  if (details.length < FEATURE_REQUEST_LIMITS.detailsMin) errors.details = `Tell us a little more (at least ${FEATURE_REQUEST_LIMITS.detailsMin} characters).`;
  else if (details.length > FEATURE_REQUEST_LIMITS.detailsMax) errors.details = `Keep the details to ${FEATURE_REQUEST_LIMITS.detailsMax} characters or fewer.`;
  else if (linkCount(details) > 3 || linkCount(title) > 0) errors.details = "Please describe the idea in your own words instead of sending links.";
  if (!isFeatureRequestCategory(category)) errors.category = "Choose a category.";
  if (!options.signedIn && (!email || !validEmail(email))) errors.email = "Enter an email address so we can follow up.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { title, details, category: category as FeatureRequestCategory, email } };
}

export function statusTransitionError(from: string, to: string, options: { duplicateOfId?: string | null; requestId?: string } = {}): string | null {
  if (!isFeatureRequestStatus(from) || !isFeatureRequestStatus(to)) return "Unknown status";
  if (to === "duplicate") {
    if (!options.duplicateOfId) return "Choose the request this one duplicates";
    if (options.requestId && options.duplicateOfId === options.requestId) return "A request cannot duplicate itself";
  }
  if (from === to) return to === "duplicate" ? null : "The request already has that status";
  if (!TRANSITIONS[from].includes(to)) return `A request that is ${FEATURE_REQUEST_STATUSES[from].toLowerCase()} cannot move to ${FEATURE_REQUEST_STATUSES[to].toLowerCase()}`;
  return null;
}

export function allowedNextStatuses(from: string): FeatureRequestStatus[] {
  return isFeatureRequestStatus(from) ? [...TRANSITIONS[from]] : [];
}

export function canVoteOn(status: string) {
  return (VOTABLE_FEATURE_REQUEST_STATUSES as string[]).includes(status);
}

/** A signed-in person sees public statuses plus anything they submitted. */
export function canViewRequest(row: { status: string; person_id: string | null }, personId: string | null) {
  if ((PUBLIC_FEATURE_REQUEST_STATUSES as string[]).includes(row.status)) return true;
  return Boolean(personId && row.person_id === personId);
}

export function shouldNotifySubmitter(from: string, to: string) {
  return from !== to && (NOTIFY_ON_STATUSES as string[]).includes(to);
}

export function statusEmail(input: { title: string; status: FeatureRequestStatus; publicNote: string | null; link: string }) {
  const lead = input.status === "planned"
    ? "Good news. Your BandWagon feature idea is now planned."
    : input.status === "shipped"
      ? "Your BandWagon feature idea has shipped. Thank you for suggesting it."
      : "Thank you for your BandWagon feature idea. We are not planning to build it right now.";
  return {
    subject: `Update on your BandWagon idea: ${input.title.slice(0, 80)}`,
    body: [lead, "", `Idea: ${input.title}`, `Status: ${FEATURE_REQUEST_STATUSES[input.status]}`, ...(input.publicNote ? ["", `Note from the BandWagon team: ${input.publicNote}`] : []), "", `See all ideas: ${input.link}`].join("\n"),
  };
}

export const FEATURE_REQUEST_SORTS = { votes: "Most votes", newest: "Newest" } as const;
export type FeatureRequestSort = keyof typeof FEATURE_REQUEST_SORTS;
export function normalizeSort(value: unknown): FeatureRequestSort {
  return value === "newest" ? "newest" : "votes";
}
export function orderByClause(sort: FeatureRequestSort) {
  return sort === "newest" ? "fr.created_at desc" : "fr.vote_count desc, fr.created_at desc";
}
