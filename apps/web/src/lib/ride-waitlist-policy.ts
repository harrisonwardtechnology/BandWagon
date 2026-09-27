// Pure rules for ride waitlists and standby offers. No imports so it can be
// unit tested with node:test. Database work lives in ride-waitlists.ts.

export const WAITLIST_ACTIVE_STATUSES = ["waiting", "offered"] as const;
export const WAITLIST_STATUSES = ["waiting", "offered", "accepted", "declined", "expired", "left", "removed", "cancelled"] as const;
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];

export const WAITLIST_DEFAULTS = {
  enabled: true,
  offerWindowMinutes: 30,
  departureCutoffMinutes: 15,
} as const;

/** An offer shorter than this is not useful to anyone, so none is made. */
export const MIN_OFFER_MINUTES = 3;
export const OFFER_WINDOW_LIMITS = { min: 5, max: 240 } as const;
export const DEPARTURE_CUTOFF_LIMITS = { min: 0, max: 240 } as const;

export type WaitlistSettings = { enabled: boolean; offerWindowMinutes: number; departureCutoffMinutes: number };

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** Missing settings row means the defaults: waitlists on, 30 minute offers, 15 minute cutoff. */
export function normalizeWaitlistSettings(row?: {
  waitlists_enabled?: unknown;
  offer_window_minutes?: unknown;
  departure_cutoff_minutes?: unknown;
} | null): WaitlistSettings {
  return {
    enabled: row?.waitlists_enabled == null ? WAITLIST_DEFAULTS.enabled : row.waitlists_enabled === true,
    offerWindowMinutes: clampInt(row?.offer_window_minutes, OFFER_WINDOW_LIMITS.min, OFFER_WINDOW_LIMITS.max, WAITLIST_DEFAULTS.offerWindowMinutes),
    departureCutoffMinutes: clampInt(row?.departure_cutoff_minutes, DEPARTURE_CUTOFF_LIMITS.min, DEPARTURE_CUTOFF_LIMITS.max, WAITLIST_DEFAULTS.departureCutoffMinutes),
  };
}

function toMs(value: Date | string | number | null | undefined) {
  if (value == null || value === "") return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Last moment a standby offer can still be open: departure minus the organization cutoff. */
export function offerCutoffAt(departureAt: Date | string | null | undefined, departureCutoffMinutes: number) {
  const departure = toMs(departureAt);
  return departure == null ? null : new Date(departure - Math.max(0, departureCutoffMinutes) * 60_000);
}

export type OfferWindow =
  | { canOffer: true; expiresAt: Date; minutes: number; shortened: boolean }
  | { canOffer: false; reason: "past_cutoff" | "too_close_to_departure" };

/**
 * How long a standby offer stays open.
 *
 * - Normally the organization window (default 30 minutes).
 * - When departure is close, the window is at most half the time left before
 *   the cutoff, so a decline or expiry still leaves time for the next person.
 * - The offer never runs past the cutoff, and no offer is made once fewer than
 *   MIN_OFFER_MINUTES remain.
 */
export function computeOfferWindow(input: {
  now: Date | string | number;
  departureAt?: Date | string | null;
  offerWindowMinutes: number;
  departureCutoffMinutes: number;
}): OfferWindow {
  const now = toMs(input.now) ?? Date.now();
  const window = clampInt(input.offerWindowMinutes, OFFER_WINDOW_LIMITS.min, OFFER_WINDOW_LIMITS.max, WAITLIST_DEFAULTS.offerWindowMinutes);
  const cutoff = offerCutoffAt(input.departureAt, input.departureCutoffMinutes);
  if (!cutoff) return { canOffer: true, expiresAt: new Date(now + window * 60_000), minutes: window, shortened: false };
  const minutesLeft = (cutoff.getTime() - now) / 60_000;
  if (minutesLeft <= 0) return { canOffer: false, reason: "past_cutoff" };
  if (minutesLeft < MIN_OFFER_MINUTES) return { canOffer: false, reason: "too_close_to_departure" };
  const shared = Math.max(MIN_OFFER_MINUTES, Math.floor(minutesLeft / 2));
  const minutes = Math.min(window, shared, Math.floor(minutesLeft));
  return { canOffer: true, expiresAt: new Date(now + minutes * 60_000), minutes, shortened: minutes < window };
}

/** Round trip and "other" can conflict with anything for the same event; otherwise only the same direction does. */
export function directionsOverlap(a: string, b: string) {
  if (a === b) return true;
  return a === "round_trip" || b === "round_trip" || a === "other" || b === "other";
}

export type QueueEntry = { id: string; joinedAt: Date | string; status: string };

/** FIFO by join time, id as a stable tie breaker. */
export function orderWaitlist<T extends QueueEntry>(entries: T[]) {
  return [...entries].sort((a, b) => {
    const diff = (toMs(a.joinedAt) ?? 0) - (toMs(b.joinedAt) ?? 0);
    return diff !== 0 ? diff : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** 1-based place in line among active entries, or null when the entry is not active. */
export function waitlistPosition(entries: QueueEntry[], entryId: string) {
  const active = orderWaitlist(entries.filter((e) => (WAITLIST_ACTIVE_STATUSES as readonly string[]).includes(e.status)));
  const index = active.findIndex((e) => e.id === entryId);
  return index < 0 ? null : index + 1;
}

export type JoinCheck = { ok: true } | { ok: false; reason: string };

export function canJoinWaitlist(input: {
  enabled: boolean;
  rideStatus: string;
  poolingEnabled: boolean;
  remainingSeats: number;
  seatsNeeded: number;
  pastCutoff: boolean;
  alreadyOnWaitlist: boolean;
  alreadyOnRide: boolean;
  seatedForEvent: boolean;
  activeMember: boolean;
}): JoinCheck {
  if (!input.activeMember) return { ok: false, reason: "Only active members of this organization can join the waitlist." };
  if (!input.enabled) return { ok: false, reason: "This organization has turned off waitlists." };
  if (input.rideStatus !== "confirmed" || !input.poolingEnabled) return { ok: false, reason: "This carpool is not taking a waitlist." };
  if (input.pastCutoff) return { ok: false, reason: "This carpool leaves too soon to join the waitlist." };
  if (input.alreadyOnRide) return { ok: false, reason: "This rider already has a seat in this carpool." };
  if (input.alreadyOnWaitlist) return { ok: false, reason: "This rider is already on the waitlist for this carpool." };
  if (input.seatedForEvent) return { ok: false, reason: "This rider already has a seat in another carpool for this event." };
  if (input.remainingSeats >= input.seatsNeeded) return { ok: false, reason: "This carpool still has open seats. Ask to join it instead." };
  return { ok: true };
}

export type CandidateFacts = {
  id: string;
  joinedAt: Date | string;
  status: string;
  seatsNeeded: number;
  requestStatus: string;
  guardianApprovalStatus: string;
  activeMember: boolean;
  seatedElsewhere: boolean;
};

export type CandidateDecision =
  | { action: "offer" }
  | { action: "skip"; reason: "awaiting_guardian_approval" | "not_enough_seats" | "not_waiting" }
  | { action: "end"; status: "removed" | "cancelled"; reason: "left_organization" | "request_closed" | "guardian_denied" | "seated_elsewhere" };

/**
 * Should this waitlisted rider get the open seat? "end" means the entry can
 * never be offered again and leaves the line; "skip" keeps their place.
 */
export function evaluateCandidate(entry: CandidateFacts, freeSeats: number): CandidateDecision {
  if (entry.status !== "waiting") return { action: "skip", reason: "not_waiting" };
  if (!entry.activeMember) return { action: "end", status: "removed", reason: "left_organization" };
  if (entry.guardianApprovalStatus === "denied") return { action: "end", status: "cancelled", reason: "guardian_denied" };
  if (entry.seatedElsewhere || entry.requestStatus === "matched") return { action: "end", status: "cancelled", reason: "seated_elsewhere" };
  if (entry.requestStatus === "cancelled" || entry.requestStatus === "completed") return { action: "end", status: "cancelled", reason: "request_closed" };
  if (entry.guardianApprovalStatus === "pending" || entry.requestStatus === "pending_approval") return { action: "skip", reason: "awaiting_guardian_approval" };
  if (entry.requestStatus !== "open") return { action: "end", status: "cancelled", reason: "request_closed" };
  if (entry.seatsNeeded > freeSeats) return { action: "skip", reason: "not_enough_seats" };
  return { action: "offer" };
}

/**
 * Walk the line in FIFO order and hand out free seats. A party that needs more
 * seats than are free keeps its place; a smaller party behind it may take the
 * seat so it does not sit empty.
 */
export function planOffers(candidates: CandidateFacts[], freeSeats: number) {
  let seats = Math.max(0, Math.floor(freeSeats));
  const offers: string[] = [];
  const ended: Array<{ id: string; status: "removed" | "cancelled"; reason: string }> = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  for (const entry of orderWaitlist(candidates)) {
    const decision = evaluateCandidate(entry, seats);
    if (decision.action === "offer") {
      offers.push(entry.id);
      seats -= entry.seatsNeeded;
    } else if (decision.action === "end") {
      ended.push({ id: entry.id, status: decision.status, reason: decision.reason });
    } else {
      skipped.push({ id: entry.id, reason: decision.reason });
    }
  }
  return { offers, ended, skipped, seatsLeft: seats };
}

/** Seats that can be offered: capacity minus confirmed seats minus seats held by open standby offers. */
export function freeSeatsForOffers(input: { capacity: number; reserved: number; heldByOffers: number }) {
  return Math.max(0, Number(input.capacity || 0) - Number(input.reserved || 0) - Number(input.heldByOffers || 0));
}

export type AcceptCheck = { ok: true } | { ok: false; reason: string };

/** Final checks made while the ride and entry rows are locked. */
export function canAcceptOffer(input: {
  entryStatus: string;
  offerExpiresAt: Date | string | null;
  now: Date | string | number;
  rideStatus: string;
  remainingSeats: number;
  seatsNeeded: number;
  requestStatus: string;
  guardianApprovalStatus: string;
  activeMember: boolean;
}): AcceptCheck {
  if (input.entryStatus !== "offered") return { ok: false, reason: "This standby offer is no longer available." };
  const expires = toMs(input.offerExpiresAt);
  const now = toMs(input.now) ?? Date.now();
  if (expires == null || expires <= now) return { ok: false, reason: "This standby offer has expired." };
  if (!input.activeMember) return { ok: false, reason: "This rider is no longer an active member of the organization." };
  if (input.rideStatus !== "confirmed") return { ok: false, reason: "This carpool is no longer taking riders." };
  if (input.guardianApprovalStatus === "pending" || input.guardianApprovalStatus === "denied") return { ok: false, reason: "A guardian needs to approve this ride first." };
  if (input.requestStatus !== "open") return { ok: false, reason: "This ride request is no longer open." };
  if (input.remainingSeats < input.seatsNeeded) return { ok: false, reason: "The seat is no longer available." };
  return { ok: true };
}

/** Seconds left on an offer, never negative. */
export function secondsRemaining(expiresAt: Date | string | null | undefined, now: Date | string | number = Date.now()) {
  const expires = toMs(expiresAt);
  const current = toMs(now) ?? Date.now();
  if (expires == null) return 0;
  return Math.max(0, Math.floor((expires - current) / 1000));
}

/** Countdown text that reads well to screen readers and does not depend on color or motion. */
export function countdownLabel(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  if (s === 0) return "Offer expired";
  const minutes = Math.floor(s / 60);
  const rest = s % 60;
  const parts: string[] = [];
  if (minutes) parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);
  if (rest || !minutes) parts.push(`${rest} ${rest === 1 ? "second" : "seconds"}`);
  return `${parts.join(" ")} left to accept`;
}

/** Dedupe key for the expiry job of one offer round. A re-offer gets a new key. */
export function offerExpiryDedupeKey(entryId: string, offerCount: number) {
  return `waitlist-offer-expire:${entryId}:${offerCount}`;
}

function when(value: Date | string | null | undefined, timeZone?: string) {
  const ms = toMs(value);
  if (ms == null) return "";
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: timeZone || "America/Chicago" });
}

/** Plain-English notification copy. No em dashes. */
export const waitlistCopy = {
  joined(position: number | null) {
    return {
      title: "You are on the waitlist",
      body: position ? `You are number ${position} in line for this carpool. We will let you know if a seat opens.` : "You are on the waitlist for this carpool. We will let you know if a seat opens.",
    };
  },
  offer(input: { minutes: number; expiresAt: Date | string; eventTitle?: string | null; timeZone?: string }) {
    const what = input.eventTitle ? `a carpool to ${input.eventTitle}` : "a carpool";
    return {
      title: "A seat opened up",
      body: `A seat opened in ${what}. You have ${input.minutes} minutes to accept it, until ${when(input.expiresAt, input.timeZone)}. Open BandWagon to accept or pass.`,
    };
  },
  expired() {
    return {
      title: "Standby offer expired",
      body: "The seat we held for you was not accepted in time, so it went to the next person on the waitlist.",
    };
  },
  accepted() {
    return { title: "Seat confirmed", body: "You took the open seat. Your carpool is confirmed." };
  },
  driverSeatFilled() {
    return { title: "Open seat filled", body: "A rider from the waitlist took the open seat in your carpool." };
  },
  closed(reason: "ride_cancelled" | "ride_departed" | "waitlists_disabled") {
    if (reason === "ride_cancelled") return { title: "Carpool cancelled", body: "The carpool you were waiting for was cancelled, so its waitlist has been cleared. You can request a ride or join another carpool." };
    if (reason === "waitlists_disabled") return { title: "Waitlist closed", body: "Your organization turned off waitlists, so this waitlist has been cleared." };
    return { title: "Waitlist closed", body: "The carpool you were waiting for has left, so its waitlist has been cleared." };
  },
  removed(reason: string) {
    if (reason === "seated_elsewhere") return { title: "Removed from waitlist", body: "You already have a seat in another carpool for this event, so we took you off this waitlist." };
    if (reason === "left_organization") return { title: "Removed from waitlist", body: "You are no longer an active member of this organization, so we took you off the waitlist." };
    return { title: "Removed from waitlist", body: "Your ride request is closed, so we took you off the waitlist." };
  },
};

export function containsEmDash(text: string) {
  return /[—–]/.test(text);
}
