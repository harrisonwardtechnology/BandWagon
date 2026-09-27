import type { PoolClient } from "pg";
import { getDb } from "@/lib/db";
import type { SessionIdentity } from "@/lib/auth";
import { enqueueJob } from "@/lib/jobs";
import { queueNotification } from "@/lib/notification-queue";
import { guardianApprovalFor } from "@/lib/rides";
import { reserveSeatForRequest } from "@/lib/carpool";
import { requestWaitlistProcessing, WAITLIST_EXPIRE_JOB_KIND } from "@/lib/ride-waitlist-queue";
import {
  canAcceptOffer,
  canJoinWaitlist,
  computeOfferWindow,
  DEPARTURE_CUTOFF_LIMITS,
  freeSeatsForOffers,
  normalizeWaitlistSettings,
  OFFER_WINDOW_LIMITS,
  offerCutoffAt,
  offerExpiryDedupeKey,
  planOffers,
  waitlistCopy,
  type CandidateFacts,
  type WaitlistSettings,
} from "@/lib/ride-waitlist-policy";

// Waitlists and standby offers. See docs/RIDE-WORKFLOW.md "Waitlists".
//
// Locking order, used everywhere so concurrent workers and web requests
// cannot deadlock: ride row (FOR UPDATE) -> waitlist entry rows -> request row.
// The ride row lock is what makes seat counting safe across many web and
// worker instances; entries are picked with SKIP LOCKED so two processors
// working on sibling rides for the same event never offer one person twice.

type Queryable = Pick<PoolClient, "query">;
type Notice = { entryId: string; notificationType: string; title: string; body: string; url?: string; toDriver?: string | null; organizationId: string };

const APP_URL = "/app/rides";
const TIME_ZONE = process.env.DEFAULT_TIME_ZONE || "America/Chicago";
const ACTIVE_RIDE_STATUSES = ["confirmed", "driver_en_route", "arrived", "picked_up"];

function dbRequired() {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

async function inTransaction<T>(fn: (client: PoolClient) => Promise<T>) {
  const client = await dbRequired().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function audit(q: Queryable, input: { organizationId: string; actorPersonId: string | null; action: string; entryId: string; metadata?: Record<string, unknown> }) {
  await q.query(
    `insert into audit_events(organization_id,actor_person_id,action,target_type,target_id,metadata)
     values($1::uuid,$2::uuid,$3,'ride_waitlist_entry',$4::text,$5::jsonb)`,
    [input.organizationId, input.actorPersonId, `ride_waitlist.${input.action}`, input.entryId, JSON.stringify(input.metadata || {})]
  );
}

async function isActiveMember(q: Queryable, organizationId: string, personId: string) {
  const r = await q.query(`select 1 from memberships where organization_id=$1 and person_id=$2 and status='active' limit 1`, [organizationId, personId]);
  return Boolean(r.rowCount);
}

export async function getWaitlistSettings(organizationId: string, q: Queryable = dbRequired()): Promise<WaitlistSettings> {
  const row = (await q.query(`select waitlists_enabled,offer_window_minutes,departure_cutoff_minutes from organization_waitlist_settings where organization_id=$1`, [organizationId])).rows[0];
  return normalizeWaitlistSettings(row);
}

export async function updateWaitlistSettings(identity: SessionIdentity, input: { organizationId: string; enabled: boolean; offerWindowMinutes: unknown; departureCutoffMinutes: unknown }) {
  const db = dbRequired();
  const previous = await getWaitlistSettings(input.organizationId);
  const next = normalizeWaitlistSettings({ waitlists_enabled: input.enabled === true, offer_window_minutes: input.offerWindowMinutes, departure_cutoff_minutes: input.departureCutoffMinutes });
  await db.query(
    `insert into organization_waitlist_settings(organization_id,waitlists_enabled,offer_window_minutes,departure_cutoff_minutes,updated_by_person_id,updated_at)
     values($1,$2,$3,$4,$5,now())
     on conflict(organization_id) do update set waitlists_enabled=excluded.waitlists_enabled,offer_window_minutes=excluded.offer_window_minutes,
       departure_cutoff_minutes=excluded.departure_cutoff_minutes,updated_by_person_id=excluded.updated_by_person_id,updated_at=now()`,
    [input.organizationId, next.enabled, next.offerWindowMinutes, next.departureCutoffMinutes, identity.personId]
  );
  await db.query(
    `insert into audit_events(organization_id,actor_person_id,action,target_type,target_id,metadata) values($1::uuid,$2::uuid,'ride_waitlist.settings_updated','organization',$3::text,$4::jsonb)`,
    [input.organizationId, identity.personId, input.organizationId, JSON.stringify({ previous, next })]
  );
  if (previous.enabled && !next.enabled) {
    // Turning waitlists off clears every open waitlist in the organization.
    const rides = await db.query(`select distinct coalesce(offered_ride_id,ride_id) as ride_id from ride_waitlist_entries where organization_id=$1 and status in ('waiting','offered')`, [input.organizationId]);
    for (const row of rides.rows) await processRideWaitlist(row.ride_id).catch(() => null);
  }
  return { settings: next, limits: { offerWindow: OFFER_WINDOW_LIMITS, departureCutoff: DEPARTURE_CUTOFF_LIMITS } };
}

async function lockRide(client: Queryable, rideId: string) {
  const r = await client.query(
    `select r.*,rr.direction,e.title as event_title,e.starts_at as event_starts_at,
            coalesce(r.scheduled_pickup_at,rr.requested_pickup_at,e.starts_at) as departure_at
       from rides r
       join ride_requests rr on rr.id=r.ride_request_id
       left join events e on e.id=r.event_id
      where r.id=$1
      for update of r`,
    [rideId]
  );
  if (!r.rowCount) throw new Error("Carpool not found");
  return r.rows[0];
}

async function heldSeats(q: Queryable, rideId: string, exceptEntryId: string | null = null) {
  const r = await q.query(
    `select coalesce(sum(seats_needed),0)::int as held from ride_waitlist_entries
      where offered_ride_id=$1 and status='offered' and ($2::uuid is null or id<>$2::uuid)`,
    [rideId, exceptEntryId]
  );
  return Number(r.rows[0]?.held || 0);
}

/** Does this person already hold a seat in another active carpool for the same event and an overlapping direction? */
async function seatedForEvent(q: Queryable, input: { personId: string; eventId: string | null; direction: string; excludeRideId?: string | null }) {
  if (!input.eventId) return false;
  const r = await q.query(
    `select 1 from ride_passengers rp
       join rides r on r.id=rp.ride_id
       join ride_requests prr on prr.id=r.ride_request_id
      where rp.person_id=$1 and rp.assignment_status='confirmed'
        and r.status = any($2::text[]) and r.event_id=$3
        and ($5::uuid is null or r.id<>$5::uuid)
        and (prr.direction=$4 or prr.direction in ('round_trip','other') or $4 in ('round_trip','other'))
      limit 1`,
    [input.personId, ACTIVE_RIDE_STATUSES, input.eventId, input.direction, input.excludeRideId || null]
  );
  return Boolean(r.rowCount);
}

// ---------------------------------------------------------------- join / leave

export async function joinWaitlist(input: { rideId: string; passengerPersonId: string; actorPersonId: string; seatsNeeded?: number }) {
  const seatsNeeded = Math.max(1, Math.min(12, Number(input.seatsNeeded || 1)));
  const result = await inTransaction(async (client) => {
    const ride = await lockRide(client, input.rideId);
    const settings = await getWaitlistSettings(ride.organization_id, client);
    const [actorMember, passengerMember] = await Promise.all([
      isActiveMember(client, ride.organization_id, input.actorPersonId),
      isActiveMember(client, ride.organization_id, input.passengerPersonId),
    ]);
    const onRide = await client.query(`select 1 from ride_passengers where ride_id=$1 and person_id=$2 and assignment_status='confirmed' limit 1`, [ride.id, input.passengerPersonId]);
    const onWaitlist = await client.query(`select 1 from ride_waitlist_entries where ride_id=$1 and passenger_person_id=$2 and status in ('waiting','offered') limit 1`, [ride.id, input.passengerPersonId]);
    const held = await heldSeats(client, ride.id);
    const cutoff = offerCutoffAt(ride.departure_at, settings.departureCutoffMinutes);
    const check = canJoinWaitlist({
      enabled: settings.enabled,
      rideStatus: ride.status,
      poolingEnabled: ride.pooling_enabled !== false,
      remainingSeats: Number(ride.capacity_snapshot) - Number(ride.seats_reserved) - held,
      seatsNeeded,
      pastCutoff: Boolean(cutoff && cutoff.getTime() <= Date.now()),
      alreadyOnWaitlist: Boolean(onWaitlist.rowCount),
      alreadyOnRide: Boolean(onRide.rowCount),
      seatedForEvent: await seatedForEvent(client, { personId: input.passengerPersonId, eventId: ride.event_id, direction: ride.direction, excludeRideId: ride.id }),
      activeMember: actorMember && passengerMember,
    });
    if (!check.ok) throw new Error(check.reason);
    if (ride.driver_person_id === input.passengerPersonId) throw new Error("The driver cannot join their own waitlist.");

    // Reuse an open request for the same event and direction, or create one.
    // Creating it here applies the normal guardian approval rules.
    let request = (await client.query(
      `select * from ride_requests rr
        where rr.organization_id=$1 and rr.passenger_person_id=$2 and rr.event_id is not distinct from $3::uuid and rr.direction=$4
          and rr.status in ('open','pending_approval')
          and not exists (select 1 from ride_request_assignments a where a.ride_request_id=rr.id and a.status='confirmed')
        order by rr.created_at desc limit 1 for update`,
      [ride.organization_id, input.passengerPersonId, ride.event_id, ride.direction]
    )).rows[0];
    let createdRequest = false;
    if (!request) {
      const approval = await guardianApprovalFor(input.passengerPersonId, input.actorPersonId);
      const status = approval.status === "pending" ? "pending_approval" : "open";
      request = (await client.query(
        `insert into ride_requests(organization_id,event_id,requester_person_id,passenger_person_id,direction,seats_needed,requested_pickup_at,
                                   guardian_approval_status,approved_by_person_id,approved_at,status,created_via)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,case when $8='approved' then now() else null end,$10,'user') returning *`,
        [ride.organization_id, ride.event_id, input.actorPersonId, input.passengerPersonId, ride.direction, seatsNeeded, ride.departure_at, approval.status, approval.approvedBy, status]
      )).rows[0];
      await client.query(
        `insert into ride_status_events(ride_request_id,actor_person_id,event_type,to_status,metadata) values($1,$2,'ride_request_created',$3,$4::jsonb)`,
        [request.id, input.actorPersonId, status, JSON.stringify({ via: "waitlist", rideId: ride.id })]
      );
      createdRequest = true;
    }
    if (request.guardian_approval_status === "denied") throw new Error("A guardian declined this ride request.");

    let entry;
    try {
      entry = (await client.query(
        `insert into ride_waitlist_entries(organization_id,ride_id,event_id,direction,ride_request_id,passenger_person_id,joined_by_person_id,seats_needed,status)
         values($1,$2,$3,$4,$5,$6,$7,$8,'waiting') returning *`,
        [ride.organization_id, ride.id, ride.event_id, ride.direction, request.id, input.passengerPersonId, input.actorPersonId, Number(request.seats_needed || seatsNeeded)]
      )).rows[0];
    } catch (error: any) {
      if (error?.code === "23505") throw new Error("This rider is already on the waitlist for this carpool.");
      throw error;
    }
    await audit(client, {
      organizationId: ride.organization_id, actorPersonId: input.actorPersonId, action: "joined", entryId: entry.id,
      metadata: { rideId: ride.id, rideRequestId: request.id, passengerPersonId: input.passengerPersonId, createdRequest, guardianApprovalStatus: request.guardian_approval_status },
    });
    const position = await positionOf(client, entry.id);
    return { entry: { ...entry, position }, organizationId: ride.organization_id, pendingApproval: request.status === "pending_approval" };
  });
  const copy = waitlistCopy.joined(result.entry.position);
  await notifyEntry({ entryId: result.entry.id, notificationType: "waitlist_update", ...copy, organizationId: result.organizationId });
  // A seat may have opened between the page load and now.
  await requestWaitlistProcessing(input.rideId, "joined");
  return result.entry;
}

async function lockEntryWithRide(client: Queryable, entryId: string) {
  const peek = (await dbRequired().query(`select id,ride_id,offered_ride_id,status from ride_waitlist_entries where id=$1`, [entryId])).rows[0];
  if (!peek) throw new Error("Waitlist entry not found");
  const rideId = peek.status === "offered" && peek.offered_ride_id ? peek.offered_ride_id : peek.ride_id;
  const ride = await lockRide(client, rideId);
  const entry = (await client.query(`select * from ride_waitlist_entries where id=$1 for update`, [entryId])).rows[0];
  const lockedRideId = entry?.status === "offered" && entry.offered_ride_id ? entry.offered_ride_id : entry?.ride_id;
  if (!entry || lockedRideId !== rideId) throw new Error("This waitlist entry just changed. Please try again.");
  return { ride, entry };
}

async function actorManagesEntry(q: Queryable, actorPersonId: string, entry: any) {
  if (actorPersonId === entry.passenger_person_id || actorPersonId === entry.joined_by_person_id) return true;
  const r = await q.query(
    `select 1 from ride_requests rr where rr.id=$1 and rr.requester_person_id=$2
     union all
     select 1 from guardian_relationships gr where gr.guardian_person_id=$2 and gr.minor_person_id=$3 and (gr.can_approve_rides=true or gr.can_manage_profile=true)
     limit 1`,
    [entry.ride_request_id, actorPersonId, entry.passenger_person_id]
  );
  return Boolean(r.rowCount);
}

export async function leaveWaitlist(input: { entryId: string; actorPersonId: string }) {
  const outcome = await inTransaction(async (client) => {
    const { ride, entry } = await lockEntryWithRide(client, input.entryId);
    if (!(await actorManagesEntry(client, input.actorPersonId, entry))) throw new Error("You cannot change this waitlist entry");
    if (!["waiting", "offered"].includes(entry.status)) throw new Error("This rider is no longer on the waitlist.");
    await client.query(`update ride_waitlist_entries set status='left',ended_at=now(),end_reason='left',responded_at=case when status='offered' then now() else responded_at end,updated_at=now() where id=$1`, [entry.id]);
    await audit(client, { organizationId: entry.organization_id, actorPersonId: input.actorPersonId, action: "left", entryId: entry.id, metadata: { rideId: entry.ride_id, hadOffer: entry.status === "offered" } });
    // Leaving with an offer in hand frees that seat for the next person now.
    const notices = entry.status === "offered" ? await processLockedRide(client, ride) : [];
    return { notices };
  });
  await sendNotices(outcome.notices);
  return { ok: true };
}

export async function declineStandbyOffer(input: { entryId: string; actorPersonId: string }) {
  const outcome = await inTransaction(async (client) => {
    const { ride, entry } = await lockEntryWithRide(client, input.entryId);
    if (!(await actorManagesEntry(client, input.actorPersonId, entry))) throw new Error("You cannot respond to this standby offer");
    if (entry.status !== "offered") throw new Error("This standby offer is no longer available.");
    await client.query(`update ride_waitlist_entries set status='declined',responded_at=now(),ended_at=now(),end_reason='declined',updated_at=now() where id=$1`, [entry.id]);
    await audit(client, { organizationId: entry.organization_id, actorPersonId: input.actorPersonId, action: "declined", entryId: entry.id, metadata: { rideId: ride.id, offerCount: entry.offer_count } });
    return { notices: await processLockedRide(client, ride) };
  });
  await sendNotices(outcome.notices);
  return { ok: true };
}

/**
 * Claim the held seat. The ride row is locked FOR UPDATE, then the entry and
 * the request, and capacity is re-checked under those locks, so two accepts
 * (or an accept racing a manual pooling) can never book the same seat.
 */
export async function acceptStandbyOffer(input: { entryId: string; actorPersonId: string }) {
  const outcome = await inTransaction(async (client) => {
    const { ride, entry } = await lockEntryWithRide(client, input.entryId);
    if (!(await actorManagesEntry(client, input.actorPersonId, entry))) throw new Error("You cannot respond to this standby offer");
    const request = (await client.query(`select * from ride_requests where id=$1 for update`, [entry.ride_request_id])).rows[0];
    if (!request) throw new Error("Ride request not found");
    const held = await heldSeats(client, ride.id, entry.id);
    const check = canAcceptOffer({
      entryStatus: entry.status,
      offerExpiresAt: entry.offer_expires_at,
      now: (await client.query(`select now() as now`)).rows[0].now,
      rideStatus: ride.status,
      remainingSeats: Number(ride.capacity_snapshot) - Number(ride.seats_reserved) - held,
      seatsNeeded: Number(request.seats_needed),
      requestStatus: request.status,
      guardianApprovalStatus: request.guardian_approval_status,
      activeMember: await isActiveMember(client, entry.organization_id, entry.passenger_person_id),
    });
    if (!check.ok) throw new Error(check.reason);
    if (request.event_id !== ride.event_id && (request.event_id || ride.event_id)) throw new Error("This standby offer is for a different event.");

    await reserveSeatForRequest(client, {
      ride, request, actorPersonId: input.actorPersonId, eventType: "waitlist_offer_accepted",
      remainingBefore: Number(ride.capacity_snapshot) - Number(ride.seats_reserved),
      metadata: { waitlistEntryId: entry.id },
    });
    await client.query(`update ride_waitlist_entries set status='accepted',responded_at=now(),ended_at=now(),end_reason='accepted',updated_at=now() where id=$1`, [entry.id]);
    await audit(client, { organizationId: entry.organization_id, actorPersonId: input.actorPersonId, action: "accepted", entryId: entry.id, metadata: { rideId: ride.id, waitlistedRideId: entry.ride_id, rideRequestId: request.id } });

    // Now seated: leave every other waitlist for this event and direction.
    const others = (await client.query(
      `update ride_waitlist_entries set status='cancelled',ended_at=now(),end_reason='seated_elsewhere',updated_at=now()
        where passenger_person_id=$1 and id<>$2 and status in ('waiting','offered')
          and (ride_request_id=$3 or ($4::uuid is not null and event_id=$4::uuid and (direction=$5 or direction in ('round_trip','other') or $5 in ('round_trip','other'))))
        returning id,organization_id,ride_id,offered_ride_id,status`,
      [entry.passenger_person_id, entry.id, request.id, ride.event_id, ride.direction]
    )).rows;
    for (const other of others) await audit(client, { organizationId: other.organization_id, actorPersonId: input.actorPersonId, action: "cancelled", entryId: other.id, metadata: { reason: "seated_elsewhere", acceptedEntryId: entry.id } });
    return { ride, entry, request, releasedRides: Array.from(new Set(others.map((o: any) => o.offered_ride_id).filter(Boolean))) as string[] };
  });
  const { ride, entry } = outcome;
  await Promise.allSettled([
    notifyEntry({ entryId: entry.id, notificationType: "ride_matched", ...waitlistCopy.accepted(), organizationId: entry.organization_id }),
    queueNotification({ notificationType: "ride_matched", ...waitlistCopy.driverSeatFilled(), personId: ride.driver_person_id, organizationId: entry.organization_id, url: APP_URL }),
    ...outcome.releasedRides.filter((id) => id !== ride.id).map((id) => requestWaitlistProcessing(id, "offer_released")),
  ]);
  return { ok: true, rideId: ride.id };
}

// ---------------------------------------------------------------- processing

/** Worker entry point for waitlist.process_ride jobs. Safe to run from any number of workers. */
export async function processRideWaitlist(rideId: string) {
  const exists = await dbRequired().query(`select 1 from rides where id=$1`, [rideId]);
  if (!exists.rowCount) return { skipped: true, reason: "ride not found" };
  const notices = await inTransaction(async (client) => processLockedRide(client, await lockRide(client, rideId)));
  await sendNotices(notices);
  return { notices: notices.length };
}

/** Worker entry point for waitlist.offer_expire jobs (scheduled at the offer's expiry time, deduped per offer). */
export async function expireStandbyOffer(entryId: string) {
  const entry = (await dbRequired().query(`select offered_ride_id,status from ride_waitlist_entries where id=$1`, [entryId])).rows[0];
  if (!entry || entry.status !== "offered" || !entry.offered_ride_id) return { skipped: true };
  // Expiry itself happens inside processing, under the ride lock and using the database clock.
  return processRideWaitlist(entry.offered_ride_id);
}

type CloseReason = "ride_cancelled" | "ride_departed" | "waitlists_disabled";

async function processLockedRide(client: Queryable, ride: any): Promise<Notice[]> {
  const notices: Notice[] = [];
  const settings = await getWaitlistSettings(ride.organization_id, client);
  const now = new Date((await client.query(`select now() as now`)).rows[0].now);
  const departure = ride.departure_at ? new Date(ride.departure_at) : null;

  let closeReason: CloseReason | null = null;
  if (ride.status === "cancelled") closeReason = "ride_cancelled";
  else if (ride.status !== "confirmed" || (departure && departure.getTime() <= now.getTime())) closeReason = "ride_departed";
  else if (!settings.enabled) closeReason = "waitlists_disabled";

  if (closeReason) {
    // Entries waiting on this ride end. Offers on this ride for people who are
    // waiting on another carpool go back to waiting there.
    const closed = (await client.query(
      `update ride_waitlist_entries set status='cancelled',ended_at=now(),end_reason=$2,updated_at=now()
        where ride_id=$1 and status in ('waiting','offered') and (status='waiting' or offered_ride_id=$1 or $2='waitlists_disabled')
        returning id,organization_id`,
      [ride.id, closeReason]
    )).rows;
    for (const row of closed) {
      await audit(client, { organizationId: row.organization_id, actorPersonId: null, action: "closed", entryId: row.id, metadata: { rideId: ride.id, reason: closeReason } });
      notices.push({ entryId: row.id, notificationType: closeReason === "ride_cancelled" ? "last_minute_cancellation" : "waitlist_update", ...waitlistCopy.closed(closeReason), organizationId: row.organization_id });
    }
    const returned = (await client.query(
      `update ride_waitlist_entries set status='waiting',offered_ride_id=null,offered_at=null,offer_expires_at=null,updated_at=now()
        where offered_ride_id=$1 and status='offered' and ride_id<>$1 returning id,ride_id,organization_id`,
      [ride.id]
    )).rows;
    for (const row of returned) {
      await audit(client, { organizationId: row.organization_id, actorPersonId: null, action: "offer_withdrawn", entryId: row.id, metadata: { offeredRideId: ride.id, reason: closeReason } });
      await enqueueJob({ kind: "waitlist.process_ride", payload: { rideId: row.ride_id, reason: "offer_withdrawn" }, maxAttempts: 3, db: client as PoolClient });
    }
    return notices;
  }

  // 1. Expire offers whose time is up (database clock).
  const expired = (await client.query(
    `update ride_waitlist_entries set status='expired',ended_at=now(),end_reason='offer_expired',updated_at=now()
      where offered_ride_id=$1 and status='offered' and offer_expires_at<=now()
      returning id,organization_id,offer_count`,
    [ride.id]
  )).rows;
  for (const row of expired) {
    await audit(client, { organizationId: row.organization_id, actorPersonId: null, action: "expired", entryId: row.id, metadata: { rideId: ride.id, offerCount: row.offer_count } });
    notices.push({ entryId: row.id, notificationType: "waitlist_update", ...waitlistCopy.expired(), organizationId: row.organization_id });
  }

  // 2. Work out how many seats can be offered.
  const window = computeOfferWindow({ now, departureAt: ride.departure_at, offerWindowMinutes: settings.offerWindowMinutes, departureCutoffMinutes: settings.departureCutoffMinutes });
  if (!window.canOffer || ride.pooling_enabled === false) return notices;
  const free = freeSeatsForOffers({ capacity: ride.capacity_snapshot, reserved: ride.seats_reserved, heldByOffers: await heldSeats(client, ride.id) });
  if (free <= 0) return notices;

  // 3. Candidates in FIFO order: people waiting on this ride, plus people
  //    waiting on another carpool for the same event and direction.
  const rows = (await client.query(
    `select w.*,rr.status as request_status,rr.guardian_approval_status,
            exists(select 1 from memberships m where m.organization_id=w.organization_id and m.person_id=w.passenger_person_id and m.status='active') as active_member,
            exists(select 1 from ride_passengers rp join rides r2 on r2.id=rp.ride_id join ride_requests prr on prr.id=r2.ride_request_id
                    where rp.person_id=w.passenger_person_id and rp.assignment_status='confirmed' and r2.status = any($5::text[])
                      and w.event_id is not null and r2.event_id=w.event_id
                      and (prr.direction=w.direction or prr.direction in ('round_trip','other') or w.direction in ('round_trip','other'))) as seated_elsewhere
       from ride_waitlist_entries w
       join ride_requests rr on rr.id=w.ride_request_id
      where w.status='waiting' and w.organization_id=$1
        and (w.ride_id=$2 or ($3::uuid is not null and w.event_id=$3::uuid and w.direction=$4))
        and w.passenger_person_id<>$6
      order by w.joined_at,w.id
      limit 50
      for update of w skip locked`,
    [ride.organization_id, ride.id, ride.event_id, ride.direction, ACTIVE_RIDE_STATUSES, ride.driver_person_id]
  )).rows;
  const facts: CandidateFacts[] = rows.map((row: any) => ({
    id: row.id, joinedAt: row.joined_at, status: row.status, seatsNeeded: Number(row.seats_needed),
    requestStatus: row.request_status, guardianApprovalStatus: row.guardian_approval_status,
    activeMember: row.active_member === true, seatedElsewhere: row.seated_elsewhere === true,
  }));
  const plan = planOffers(facts, free);
  const byId = new Map(rows.map((row: any) => [row.id, row]));

  for (const end of plan.ended) {
    const row: any = byId.get(end.id);
    await client.query(`update ride_waitlist_entries set status=$2,ended_at=now(),end_reason=$3,updated_at=now() where id=$1`, [end.id, end.status, end.reason]);
    await audit(client, { organizationId: row.organization_id, actorPersonId: null, action: end.status, entryId: end.id, metadata: { rideId: row.ride_id, reason: end.reason } });
    notices.push({ entryId: end.id, notificationType: "waitlist_update", ...waitlistCopy.removed(end.reason), organizationId: row.organization_id });
  }

  for (const id of plan.offers) {
    const row: any = byId.get(id);
    const updated = (await client.query(
      `update ride_waitlist_entries set status='offered',offered_ride_id=$2,offered_at=now(),offer_expires_at=$3,offer_count=offer_count+1,updated_at=now()
        where id=$1 and status='waiting' returning offer_count`,
      [id, ride.id, window.expiresAt]
    )).rows[0];
    if (!updated) continue;
    await enqueueJob({
      kind: WAITLIST_EXPIRE_JOB_KIND,
      payload: { entryId: id, offerCount: updated.offer_count },
      runAt: window.expiresAt,
      dedupeKey: offerExpiryDedupeKey(id, updated.offer_count),
      maxAttempts: 5,
      db: client as PoolClient,
    });
    await audit(client, {
      organizationId: row.organization_id, actorPersonId: null, action: "offered", entryId: id,
      metadata: { rideId: ride.id, waitlistedRideId: row.ride_id, expiresAt: window.expiresAt.toISOString(), minutes: window.minutes, shortened: window.shortened, offerCount: updated.offer_count },
    });
    notices.push({ entryId: id, notificationType: "waitlist_offer", ...waitlistCopy.offer({ minutes: window.minutes, expiresAt: window.expiresAt, eventTitle: ride.event_title, timeZone: TIME_ZONE }), organizationId: row.organization_id });
  }
  return notices;
}

/** Scheduled safety net: expire late offers, close departed waitlists, and fill seats that opened without a job. */
export async function sweepRideWaitlists(limit = 200) {
  const db = dbRequired();
  const rides = await db.query(
    `select distinct ride_id from (
       select offered_ride_id as ride_id from ride_waitlist_entries where status='offered' and offer_expires_at<=now()
       union
       select ride_id from ride_waitlist_entries where status in ('waiting','offered')
       union
       select r.id from rides r join ride_requests rr on rr.id=r.ride_request_id
        where r.status='confirmed' and r.pooling_enabled=true and r.capacity_snapshot>r.seats_reserved and r.event_id is not null
          and exists (select 1 from ride_waitlist_entries w where w.status='waiting' and w.event_id=r.event_id and w.direction=rr.direction and w.organization_id=r.organization_id)
     ) x where ride_id is not null
     limit $1`,
    [limit]
  );
  let processed = 0, failed = 0;
  for (const row of rides.rows) {
    try { await processRideWaitlist(row.ride_id); processed++; } catch { failed++; }
  }
  return { processed, failed };
}

// ---------------------------------------------------------------- notifications

async function recipientsFor(entryId: string) {
  const row = (await dbRequired().query(
    `select w.passenger_person_id,w.joined_by_person_id,rr.requester_person_id,p.person_type
       from ride_waitlist_entries w join ride_requests rr on rr.id=w.ride_request_id join people p on p.id=w.passenger_person_id
      where w.id=$1`,
    [entryId]
  )).rows[0];
  if (!row) return [];
  const ids = new Set<string>();
  if (row.requester_person_id) ids.add(row.requester_person_id);
  if (row.joined_by_person_id) ids.add(row.joined_by_person_id);
  // Adults hear about their own seat directly. A minor's household is told through the guardian who asked.
  if (row.person_type !== "minor") ids.add(row.passenger_person_id);
  return Array.from(ids);
}

async function notifyEntry(notice: Notice) {
  const recipients = await recipientsFor(notice.entryId).catch(() => [] as string[]);
  // The notification router applies each person's preferences and SMS consent.
  await Promise.allSettled(recipients.map((personId) => queueNotification({
    notificationType: notice.notificationType, title: notice.title, body: notice.body, url: notice.url || APP_URL,
    personId, organizationId: notice.organizationId,
  })));
}

async function sendNotices(notices: Notice[]) {
  await Promise.allSettled(notices.map((notice) => notifyEntry(notice)));
}

// ---------------------------------------------------------------- driver seats

/** Driver changes the number of seats in a confirmed carpool. More seats wake the waitlist. */
export async function updateRideSeats(input: { rideId: string; driverPersonId: string; seats: number }) {
  const seats = Math.round(Number(input.seats));
  if (!Number.isFinite(seats) || seats < 1 || seats > 12) throw new Error("Seats must be between 1 and 12");
  const result = await inTransaction(async (client) => {
    const ride = await lockRide(client, input.rideId);
    if (ride.driver_person_id !== input.driverPersonId) throw new Error("Only the driver can change the seats in this carpool");
    if (ride.status !== "confirmed") throw new Error("Seats can only change before the driver leaves");
    const held = await heldSeats(client, ride.id);
    if (seats < Number(ride.seats_reserved) + held) throw new Error(`This carpool already has ${Number(ride.seats_reserved) + held} seats taken or offered`);
    const previous = Number(ride.capacity_snapshot);
    await client.query(`update rides set capacity_snapshot=$2,updated_at=now() where id=$1`, [ride.id, seats]);
    await client.query(
      `insert into ride_status_events(ride_id,ride_request_id,actor_person_id,event_type,metadata) values($1,$2,$3,'ride_capacity_changed',$4::jsonb)`,
      [ride.id, ride.ride_request_id, input.driverPersonId, JSON.stringify({ previous, seats })]
    );
    return { previous, seats };
  });
  if (result.seats > result.previous) await requestWaitlistProcessing(input.rideId, "seats_added");
  return result;
}

// ---------------------------------------------------------------- views

async function positionOf(q: Queryable, entryId: string) {
  const r = await q.query(
    `select count(*)::int + 1 as position from ride_waitlist_entries w
       join ride_waitlist_entries me on me.id=$1
      where w.ride_id=me.ride_id and w.status in ('waiting','offered') and w.id<>me.id
        and (w.joined_at,w.id) < (me.joined_at,me.id)`,
    [entryId]
  );
  return Number(r.rows[0]?.position || 1);
}

/** The rider's own entries (for people they manage), with place in line and offer timing. No other riders' details. */
export async function listRiderWaitlists(input: { managedPersonIds: string[]; organizationIds: string[] }) {
  if (!input.managedPersonIds.length || !input.organizationIds.length) return [];
  const rows = await dbRequired().query(
    `select w.id,w.ride_id,w.offered_ride_id,w.status,w.seats_needed,w.joined_at,w.offered_at,w.offer_expires_at,w.end_reason,w.ended_at,w.direction,
            w.passenger_person_id,p.display_name as passenger_name,rr.status as request_status,rr.guardian_approval_status,
            e.title as event_title,coalesce(r.scheduled_pickup_at,e.starts_at) as departure_at,
            greatest(0,extract(epoch from w.offer_expires_at-now()))::int as seconds_remaining,
            case when w.status in ('waiting','offered') then (
              select count(*)::int + 1 from ride_waitlist_entries o
               where o.ride_id=w.ride_id and o.status in ('waiting','offered') and o.id<>w.id and (o.joined_at,o.id)<(w.joined_at,w.id)) end as position,
            (select count(*)::int from ride_waitlist_entries o where o.ride_id=w.ride_id and o.status in ('waiting','offered')) as waitlist_count
       from ride_waitlist_entries w
       join people p on p.id=w.passenger_person_id
       join ride_requests rr on rr.id=w.ride_request_id
       join rides r on r.id=w.ride_id
       left join events e on e.id=w.event_id
      where w.passenger_person_id=any($1::uuid[]) and w.organization_id=any($2::uuid[])
        and (w.status in ('waiting','offered') or w.ended_at>now()-interval '3 days')
      order by case w.status when 'offered' then 0 when 'waiting' then 1 else 2 end, w.joined_at desc
      limit 50`,
    [input.managedPersonIds, input.organizationIds]
  );
  return rows.rows;
}

/**
 * Upcoming carpools a household can see, with seat counts and waitlist size.
 * The driver's identity and other riders are not shown before a match.
 */
export async function listJoinableCarpools(input: { organizationIds: string[]; viewerPersonId: string }) {
  if (!input.organizationIds.length) return [];
  const rows = await dbRequired().query(
    `select r.id,r.organization_id,r.event_id,e.title as event_title,rr.direction,
            coalesce(r.scheduled_pickup_at,rr.requested_pickup_at,e.starts_at) as departure_at,
            r.capacity_snapshot,r.seats_reserved,
            coalesce(s.waitlists_enabled,true) as waitlists_enabled,
            greatest(0,r.capacity_snapshot-r.seats_reserved-coalesce((select sum(o.seats_needed) from ride_waitlist_entries o where o.offered_ride_id=r.id and o.status='offered'),0))::int as open_seats,
            (select count(*)::int from ride_waitlist_entries o where o.ride_id=r.id and o.status in ('waiting','offered')) as waitlist_count,
            pl.generalized_area as pickup_area
       from rides r
       join ride_requests rr on rr.id=r.ride_request_id
       left join events e on e.id=r.event_id
       left join private_locations pl on pl.id=rr.pickup_location_id
       left join organization_waitlist_settings s on s.organization_id=r.organization_id
      where r.organization_id=any($1::uuid[]) and r.status='confirmed' and r.pooling_enabled=true and r.driver_person_id<>$2
        and coalesce(r.scheduled_pickup_at,rr.requested_pickup_at,e.starts_at,now()+interval '1 hour')>now()
        and coalesce(r.scheduled_pickup_at,rr.requested_pickup_at,e.starts_at,now())<now()+interval '60 days'
      order by coalesce(r.scheduled_pickup_at,rr.requested_pickup_at,e.starts_at),r.created_at
      limit 60`,
    [input.organizationIds, input.viewerPersonId]
  );
  return rows.rows;
}

/**
 * Waitlist for a driver's own carpool. Drivers see the same things they see
 * for open ride requests: rider display name, seats, and generalized pickup
 * area. No contact details or exact addresses.
 */
export async function listDriverWaitlists(driverPersonId: string, rideIds: string[]) {
  if (!rideIds.length) return {} as Record<string, any[]>;
  const rows = await dbRequired().query(
    `select w.ride_id,w.id,w.status,w.seats_needed,w.joined_at,w.offer_expires_at,p.display_name as passenger_name,pl.generalized_area as pickup_area,
            row_number() over (partition by w.ride_id order by w.joined_at,w.id)::int as position
       from ride_waitlist_entries w
       join rides r on r.id=w.ride_id and r.driver_person_id=$1
       join people p on p.id=w.passenger_person_id
       join ride_requests rr on rr.id=w.ride_request_id
       left join private_locations pl on pl.id=rr.pickup_location_id
      where w.ride_id=any($2::uuid[]) and w.status in ('waiting','offered')
      order by w.ride_id,w.joined_at,w.id`,
    [driverPersonId, rideIds]
  );
  const out: Record<string, any[]> = {};
  for (const row of rows.rows) (out[row.ride_id] ||= []).push(row);
  return out;
}

/** Organizer view: every active waitlist in the organization. */
export async function listOrganizationWaitlists(organizationId: string) {
  const rows = await dbRequired().query(
    `select w.id,w.ride_id,w.status,w.seats_needed,w.joined_at,w.offered_at,w.offer_expires_at,w.offer_count,w.offered_ride_id,
            p.display_name as passenger_name,jb.display_name as joined_by_name,rr.guardian_approval_status,
            e.title as event_title,rreq.direction,coalesce(r.scheduled_pickup_at,e.starts_at) as departure_at,d.display_name as driver_name,
            r.capacity_snapshot,r.seats_reserved,
            row_number() over (partition by w.ride_id order by w.joined_at,w.id)::int as position
       from ride_waitlist_entries w
       join rides r on r.id=w.ride_id
       join ride_requests rreq on rreq.id=r.ride_request_id
       join people d on d.id=r.driver_person_id
       join people p on p.id=w.passenger_person_id
       left join people jb on jb.id=w.joined_by_person_id
       join ride_requests rr on rr.id=w.ride_request_id
       left join events e on e.id=w.event_id
      where w.organization_id=$1 and w.status in ('waiting','offered')
      order by coalesce(r.scheduled_pickup_at,e.starts_at),w.ride_id,w.joined_at,w.id
      limit 500`,
    [organizationId]
  );
  const recent = await dbRequired().query(
    `select status,count(*)::int as count from ride_waitlist_entries where organization_id=$1 and updated_at>now()-interval '30 days' group by status order by status`,
    [organizationId]
  );
  return { entries: rows.rows, last30Days: recent.rows };
}
