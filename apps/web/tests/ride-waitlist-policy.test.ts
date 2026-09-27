import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canAcceptOffer,
  canJoinWaitlist,
  computeOfferWindow,
  containsEmDash,
  countdownLabel,
  directionsOverlap,
  evaluateCandidate,
  freeSeatsForOffers,
  normalizeWaitlistSettings,
  offerCutoffAt,
  offerExpiryDedupeKey,
  orderWaitlist,
  planOffers,
  secondsRemaining,
  waitlistCopy,
  waitlistPosition,
  type CandidateFacts,
} from "../src/lib/ride-waitlist-policy.ts";

const NOW = new Date("2026-10-02T15:00:00Z");
const minutesFromNow = (m: number) => new Date(NOW.getTime() + m * 60_000);

function candidate(id: string, joinedMinute: number, extra: Partial<CandidateFacts> = {}): CandidateFacts {
  return {
    id, joinedAt: minutesFromNow(-100 + joinedMinute), status: "waiting", seatsNeeded: 1,
    requestStatus: "open", guardianApprovalStatus: "not_required", activeMember: true, seatedElsewhere: false, ...extra,
  };
}

test("settings default to enabled, 30 minute offers, 15 minute cutoff, and clamp bad values", () => {
  assert.deepEqual(normalizeWaitlistSettings(null), { enabled: true, offerWindowMinutes: 30, departureCutoffMinutes: 15 });
  assert.deepEqual(normalizeWaitlistSettings({ waitlists_enabled: false, offer_window_minutes: 1, departure_cutoff_minutes: 999 }), { enabled: false, offerWindowMinutes: 5, departureCutoffMinutes: 240 });
  assert.equal(normalizeWaitlistSettings({ offer_window_minutes: "abc" }).offerWindowMinutes, 30);
});

test("waitlist order is FIFO by join time with id as the tie breaker", () => {
  const entries = [
    { id: "c", joinedAt: minutesFromNow(-5), status: "waiting" },
    { id: "b", joinedAt: minutesFromNow(-10), status: "waiting" },
    { id: "a", joinedAt: minutesFromNow(-10), status: "offered" },
    { id: "z", joinedAt: minutesFromNow(-60), status: "left" },
  ];
  assert.deepEqual(orderWaitlist(entries).map((e) => e.id), ["z", "a", "b", "c"]);
  // Position only counts people still in line.
  assert.equal(waitlistPosition(entries, "a"), 1);
  assert.equal(waitlistPosition(entries, "c"), 3);
  assert.equal(waitlistPosition(entries, "z"), null);
});

test("offer window is the org window when departure is far away", () => {
  const w = computeOfferWindow({ now: NOW, departureAt: minutesFromNow(600), offerWindowMinutes: 30, departureCutoffMinutes: 15 });
  assert.equal(w.canOffer, true);
  if (w.canOffer) { assert.equal(w.minutes, 30); assert.equal(w.shortened, false); assert.equal(w.expiresAt.getTime(), minutesFromNow(30).getTime()); }
  const noDeparture = computeOfferWindow({ now: NOW, departureAt: null, offerWindowMinutes: 45, departureCutoffMinutes: 15 });
  assert.equal(noDeparture.canOffer && noDeparture.minutes, 45);
});

test("offer window shrinks near departure and never passes the cutoff", () => {
  // 55 minutes to departure, 15 minute cutoff => 40 minutes left => at most half: 20.
  const near = computeOfferWindow({ now: NOW, departureAt: minutesFromNow(55), offerWindowMinutes: 30, departureCutoffMinutes: 15 });
  assert.equal(near.canOffer, true);
  if (near.canOffer) {
    assert.equal(near.minutes, 20);
    assert.equal(near.shortened, true);
    assert.ok(near.expiresAt.getTime() <= offerCutoffAt(minutesFromNow(55), 15)!.getTime());
  }
  // 4 minutes before the cutoff: minimum offer of 3 minutes, still inside the cutoff.
  const tight = computeOfferWindow({ now: NOW, departureAt: minutesFromNow(19), offerWindowMinutes: 30, departureCutoffMinutes: 15 });
  assert.equal(tight.canOffer && tight.minutes, 3);
  // Under the minimum, or past the cutoff: no offer at all.
  assert.deepEqual(computeOfferWindow({ now: NOW, departureAt: minutesFromNow(17), offerWindowMinutes: 30, departureCutoffMinutes: 15 }), { canOffer: false, reason: "too_close_to_departure" });
  assert.deepEqual(computeOfferWindow({ now: NOW, departureAt: minutesFromNow(10), offerWindowMinutes: 30, departureCutoffMinutes: 15 }), { canOffer: false, reason: "past_cutoff" });
  assert.deepEqual(computeOfferWindow({ now: NOW, departureAt: minutesFromNow(-5), offerWindowMinutes: 30, departureCutoffMinutes: 0 }), { canOffer: false, reason: "past_cutoff" });
});

test("eligibility ends or skips entries for the right reasons", () => {
  assert.deepEqual(evaluateCandidate(candidate("a", 0), 1), { action: "offer" });
  assert.deepEqual(evaluateCandidate(candidate("a", 0, { activeMember: false }), 1), { action: "end", status: "removed", reason: "left_organization" });
  assert.deepEqual(evaluateCandidate(candidate("a", 0, { seatedElsewhere: true }), 1), { action: "end", status: "cancelled", reason: "seated_elsewhere" });
  assert.deepEqual(evaluateCandidate(candidate("a", 0, { requestStatus: "matched" }), 1), { action: "end", status: "cancelled", reason: "seated_elsewhere" });
  assert.deepEqual(evaluateCandidate(candidate("a", 0, { requestStatus: "cancelled" }), 1), { action: "end", status: "cancelled", reason: "request_closed" });
  assert.deepEqual(evaluateCandidate(candidate("a", 0, { guardianApprovalStatus: "denied", requestStatus: "cancelled" }), 1), { action: "end", status: "cancelled", reason: "guardian_denied" });
  // Minor whose request still needs a guardian: keeps their place, gets no offer yet.
  assert.deepEqual(evaluateCandidate(candidate("a", 0, { guardianApprovalStatus: "pending", requestStatus: "pending_approval" }), 1), { action: "skip", reason: "awaiting_guardian_approval" });
  assert.deepEqual(evaluateCandidate(candidate("a", 0, { seatsNeeded: 2 }), 1), { action: "skip", reason: "not_enough_seats" });
  assert.deepEqual(evaluateCandidate(candidate("a", 0, { status: "offered" }), 1), { action: "skip", reason: "not_waiting" });
});

test("planning offers walks the line in order and does not over-offer seats", () => {
  const line = [
    candidate("third", 30),
    candidate("first", 10),
    candidate("pending-minor", 5, { guardianApprovalStatus: "pending", requestStatus: "pending_approval" }),
    candidate("second", 20),
    candidate("gone", 1, { activeMember: false }),
  ];
  const plan = planOffers(line, 2);
  assert.deepEqual(plan.offers, ["first", "second"]);
  assert.deepEqual(plan.ended.map((e) => e.id), ["gone"]);
  assert.deepEqual(plan.skipped.map((e) => e.id), ["pending-minor", "third"]);
  assert.equal(plan.seatsLeft, 0);
  assert.deepEqual(planOffers(line, 0).offers, []);
});

test("a party too big for the open seat keeps its place while a smaller party behind it is offered", () => {
  const plan = planOffers([candidate("family-of-3", 0, { seatsNeeded: 3 }), candidate("solo", 5)], 1);
  assert.deepEqual(plan.offers, ["solo"]);
  assert.deepEqual(plan.skipped, [{ id: "family-of-3", reason: "not_enough_seats" }]);
});

test("expiry or decline moves the seat to the next person in line", () => {
  const line = [candidate("first", 0), candidate("second", 1), candidate("third", 2)];
  const round1 = planOffers(line, 1);
  assert.deepEqual(round1.offers, ["first"]);
  // First person's offer expires (or they pass): they leave the line, the held seat is free again.
  const afterExpiry = line.map((e) => (e.id === "first" ? { ...e, status: "expired" } : e));
  const round2 = planOffers(afterExpiry, freeSeatsForOffers({ capacity: 4, reserved: 3, heldByOffers: 0 }));
  assert.deepEqual(round2.offers, ["second"]);
  // While an offer is outstanding its seat is held, so nobody else is offered it.
  assert.equal(freeSeatsForOffers({ capacity: 4, reserved: 3, heldByOffers: 1 }), 0);
  assert.deepEqual(planOffers(afterExpiry, 0).offers, []);
});

test("expiry jobs are deduped per offer round", () => {
  assert.equal(offerExpiryDedupeKey("e1", 1), "waitlist-offer-expire:e1:1");
  assert.notEqual(offerExpiryDedupeKey("e1", 1), offerExpiryDedupeKey("e1", 2));
});

test("joining is only allowed for full, open carpools and not for conflicting riders", () => {
  const base = { enabled: true, rideStatus: "confirmed", poolingEnabled: true, remainingSeats: 0, seatsNeeded: 1, pastCutoff: false, alreadyOnWaitlist: false, alreadyOnRide: false, seatedForEvent: false, activeMember: true };
  assert.deepEqual(canJoinWaitlist(base), { ok: true });
  assert.equal(canJoinWaitlist({ ...base, enabled: false }).ok, false);
  assert.equal(canJoinWaitlist({ ...base, remainingSeats: 1 }).ok, false);
  assert.equal(canJoinWaitlist({ ...base, remainingSeats: 1, seatsNeeded: 2 }).ok, true);
  assert.equal(canJoinWaitlist({ ...base, alreadyOnWaitlist: true }).ok, false);
  assert.equal(canJoinWaitlist({ ...base, seatedForEvent: true }).ok, false);
  assert.equal(canJoinWaitlist({ ...base, alreadyOnRide: true }).ok, false);
  assert.equal(canJoinWaitlist({ ...base, rideStatus: "cancelled" }).ok, false);
  assert.equal(canJoinWaitlist({ ...base, pastCutoff: true }).ok, false);
  assert.equal(canJoinWaitlist({ ...base, activeMember: false }).ok, false);
  assert.equal(directionsOverlap("to_event", "from_event"), false);
  assert.equal(directionsOverlap("to_event", "round_trip"), true);
});

test("accepting re-checks expiry, capacity, approval, and membership", () => {
  const base = { entryStatus: "offered", offerExpiresAt: minutesFromNow(5), now: NOW, rideStatus: "confirmed", remainingSeats: 1, seatsNeeded: 1, requestStatus: "open", guardianApprovalStatus: "approved", activeMember: true };
  assert.deepEqual(canAcceptOffer(base), { ok: true });
  assert.equal(canAcceptOffer({ ...base, offerExpiresAt: minutesFromNow(0) }).ok, false);
  assert.equal(canAcceptOffer({ ...base, entryStatus: "expired" }).ok, false);
  assert.equal(canAcceptOffer({ ...base, remainingSeats: 0 }).ok, false);
  assert.equal(canAcceptOffer({ ...base, rideStatus: "driver_en_route" }).ok, false);
  assert.equal(canAcceptOffer({ ...base, guardianApprovalStatus: "pending" }).ok, false);
  assert.equal(canAcceptOffer({ ...base, activeMember: false }).ok, false);
});

test("countdown text is plain words and never negative", () => {
  assert.equal(countdownLabel(125), "2 minutes 5 seconds left to accept");
  assert.equal(countdownLabel(60), "1 minute left to accept");
  assert.equal(countdownLabel(1), "1 second left to accept");
  assert.equal(countdownLabel(-3), "Offer expired");
  assert.equal(secondsRemaining(minutesFromNow(-1), NOW), 0);
  assert.equal(secondsRemaining(minutesFromNow(2), NOW), 120);
});

test("notification copy is plain English with no em dashes", () => {
  const texts = [
    waitlistCopy.joined(3), waitlistCopy.joined(null), waitlistCopy.offer({ minutes: 20, expiresAt: minutesFromNow(20), eventTitle: "Friday Game" }),
    waitlistCopy.expired(), waitlistCopy.accepted(), waitlistCopy.driverSeatFilled(),
    waitlistCopy.closed("ride_cancelled"), waitlistCopy.closed("ride_departed"), waitlistCopy.closed("waitlists_disabled"),
    waitlistCopy.removed("seated_elsewhere"), waitlistCopy.removed("left_organization"), waitlistCopy.removed("request_closed"),
  ].flatMap((c) => [c.title, c.body]);
  for (const text of texts) {
    assert.equal(containsEmDash(text), false, text);
    assert.ok(text.length <= 600);
  }
  assert.match(waitlistCopy.offer({ minutes: 20, expiresAt: minutesFromNow(20), eventTitle: "Friday Game" }).body, /20 minutes/);
});

// SQL shape checks: seats are only claimed under row locks, inside a dedicated transaction.
test("seat claims lock the ride row, and candidates are picked with SKIP LOCKED", async () => {
  const source = await readFile(new URL("../src/lib/ride-waitlists.ts", import.meta.url), "utf8");
  const squash = (s: string) => s.replace(/\s+/g, " ").toLowerCase();
  const flat = squash(source);
  assert.match(flat, /from rides r join ride_requests rr on rr\.id=r\.ride_request_id left join events e on e\.id=r\.event_id where r\.id=\$1 for update of r/);
  assert.match(flat, /select \* from ride_waitlist_entries where id=\$1 for update/);
  assert.match(flat, /select \* from ride_requests where id=\$1 for update/);
  assert.match(flat, /order by w\.joined_at,w\.id limit 50 for update of w skip locked/);
  // Accept: lock ride, then entry, then request; re-check capacity; then reserve the seat.
  const accept = flat.slice(flat.indexOf("export async function acceptstandbyoffer"), flat.indexOf("// ---------------------------------------------------------------- processing"));
  const order = ["inTransaction", "lockEntryWithRide", "select * from ride_requests where id=$1 for update", "heldSeats", "canAcceptOffer", "reserveSeatForRequest"].map((s) => accept.indexOf(s.toLowerCase()));
  assert.ok(order.every((i) => i >= 0), `accept is missing a step: ${order}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, "accept steps are out of order");
  // Transactions use a dedicated client, never a pooled BEGIN.
  assert.match(flat, /await dbrequired\(\)\.connect\(\)/);
  assert.doesNotMatch(flat, /db\.query\(\s*['"`]begin/);
  // Expiry jobs are deduped.
  assert.match(flat, /dedupekey: offerexpirydedupekey\(id, updated\.offer_count\)/);
  // Manual pooling also counts seats held by open standby offers.
  const carpool = squash(await readFile(new URL("../src/lib/carpool.ts", import.meta.url), "utf8"));
  assert.match(carpool, /where offered_ride_id=\$1 and status='offered'/);
});

test("migration enforces one active entry per rider per ride and valid offers", async () => {
  const sql = (await readFile(new URL("../database/migrations/059_ride_waitlists.sql", import.meta.url), "utf8")).replace(/\s+/g, " ");
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS ride_waitlist_entries_active_unique ON ride_waitlist_entries\(ride_id, passenger_person_id\) WHERE status IN \('waiting','offered'\)/);
  assert.match(sql, /CHECK \(status <> 'offered' OR \(offer_expires_at IS NOT NULL AND offered_ride_id IS NOT NULL\)\)/);
  assert.match(sql, /waitlists_enabled boolean NOT NULL DEFAULT true/);
  assert.match(sql, /offer_window_minutes integer NOT NULL DEFAULT 30/);
});

test("the worker handles waitlist jobs and the scheduler sweeps them", async () => {
  const worker = await readFile(new URL("../src/lib/worker.ts", import.meta.url), "utf8");
  assert.match(worker, /job\.kind === "waitlist\.process_ride"/);
  assert.match(worker, /job\.kind === "waitlist\.offer_expire"/);
  const tasks = await readFile(new URL("../src/lib/scheduled-tasks.ts", import.meta.url), "utf8");
  assert.match(tasks, /key: "ride-waitlists", everyMinutes: 5/);
});
