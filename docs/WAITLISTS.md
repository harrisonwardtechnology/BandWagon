# Ride Waitlists

When a carpool is full, a rider (or a guardian or trusted adult acting for a child) can join its waitlist. When a seat opens, the first eligible person in line gets a short, time-limited standby offer. Migration `059_ride_waitlists.sql` adds the tables.

## How Someone Joins

- On the **Rides** page, the **Upcoming Carpools** list shows carpools with a **Join Waitlist** button when they are full.
- The rider must be an active member of the organization. A trusted adult who is not a member can join for a child only with a live "Ask for rides" grant (see [HOUSEHOLD-DELEGATES.md](HOUSEHOLD-DELEGATES.md)).
- Joining is refused when:
  - the organization turned waitlists off,
  - the carpool is not `confirmed` or does not allow pooling,
  - the carpool leaves before the organization's cutoff,
  - the rider is already in this carpool, already on its waitlist, or already seated in another carpool for the same event,
  - the carpool still has enough open seats (join it instead),
  - the rider is the driver.
- Each entry is backed by a normal ride request. An open request for the same event and direction is reused; otherwise one is created, so normal guardian approval rules apply.
- One active entry per rider per carpool (enforced by a unique index).
- The rider gets a "You are on the waitlist" notice with their place in line.

## How Offers Are Made

- The line is first in, first out by join time.
- When a seat opens, BandWagon offers it to the first eligible person. Candidates include people waiting on this carpool and people waiting on another carpool for the same event and direction.
- A party that needs more seats than are free keeps its place, and a smaller party behind it may take the seat.
- Entries waiting on guardian approval are skipped but keep their place.
- Entries are ended (removed or cancelled) when the rider left the organization, a guardian denied the request, the request closed, or the rider is seated elsewhere.
- Seats held by open offers are not offered twice.

## Hold And Expiry Timing

Organization settings (`organization_waitlist_settings`), with defaults when no row exists:

| Setting | Default | Allowed Range |
| --- | --- | --- |
| Waitlists enabled | On | On or off |
| Offer window | 30 minutes | 5 to 240 minutes |
| Departure cutoff | 15 minutes before departure | 0 to 240 minutes |

- Normally an offer stays open for the offer window.
- Close to departure, the window shrinks to at most half the time left before the cutoff, so the next person still has time.
- An offer never runs past the cutoff, and no offer is made when fewer than 3 minutes remain.
- Expiry uses the database clock.

## Accepting, Passing, And Leaving

- **Accept Seat**: the seat is claimed inside a transaction that locks the ride row, so two people can never take the same seat. The rider then leaves every other waitlist for the same event and direction.
- **Pass**: the offer is declined and the seat goes to the next person right away.
- **Leave Waitlist**: the entry ends. Leaving with an offer in hand frees the seat immediately.
- Trusted adults with "Ask for rides" can join, leave, and pass. Only "Approve rides" lets them accept a seat.

## Jobs And Scheduler

- `waitlist.process_ride` job: queued when a seat may have opened (someone joins, a passenger is removed, a ride changes status, a driver adds seats, an accepted seat releases another offer).
- `waitlist.offer_expire` job: scheduled at each offer's expiry time, deduped per offer round.
- `ride-waitlists` scheduled task: runs **every 5 minutes** (health alert if older than 20 minutes) as a safety net. It expires late offers, closes waitlists for departed or cancelled carpools, and fills seats that opened without a job. Defined in `apps/web/src/lib/scheduled-tasks.ts`.

## Notifications Sent

Sent through `queueNotification`, so each person's preferences and SMS consent apply.

| Event | Type | What Most People Get |
| --- | --- | --- |
| Joined, offer expired, removed, waitlist closed (carpool left, or waitlists turned off) | `waitlist_update` (routine) | Push, or email when push is not available. Never a text. |
| A seat opened, with minutes left and deadline | `waitlist_offer` (important) | Push, or email when push is not available. A text only in the case below. |
| Seat confirmed (rider) and open seat filled (driver) | `ride_matched` (important) | Same as `waitlist_offer`. |
| Carpool cancelled | `last_minute_cancellation` (critical) | Push, email, and a text to everyone who agreed to texts. |

### When A Standby Offer Is Texted

Most people do **not** get a text for a standby offer. All of these must be true:

- The person agreed to ride texts (SMS consent) and has a verified phone.
- The person turned off "SMS for critical only" in Notifications settings. It is on by default, and a standby offer is important, not critical.
- No push notification reached one of their devices.
- The organization is under its monthly texting limit.

Otherwise the offer arrives as push, or as email when push is not available. Offers are short lived, so people who want texts for them should turn off "SMS for critical only".

### When A Carpool Is Cancelled

A cancelled carpool closes its waitlist, and every waitlisted rider on it is told with `last_minute_cancellation`, the same critical type used for riders who had a seat. Critical means:

- A text is sent right away to each recipient who agreed to texts, even with "SMS for critical only" on, and even when the organization is over its texting limit.
- Push and email are sent too.

So one cancelled carpool can text everyone on its waitlist, even though none of them had a seat. This is how the code works today. Whether a waitlist-only rider should get a critical text, or the quieter `waitlist_update`, is an open product decision. The code that picks the type is `processLockedRide` in `apps/web/src/lib/ride-waitlists.ts`.

For adults, the rider hears directly. For a minor, notices go to the guardian or trusted adult who asked, plus trusted adults with the notifications permission.

## Admin Views

- `/admin/waitlists` (API `/api/admin/waitlists`): organization admins see every active waitlist (rider, place in line, event, driver, offer countdown) and counts by status for the last 30 days.
- Organization admins change the settings there. Platform owner, support, and readonly roles can view.
- Drivers see their own carpool's waitlist on the Rides page and can change seat count (1 to 12). Adding seats wakes the waitlist.

## Tables And Audit

- `organization_waitlist_settings` and `ride_waitlist_entries` (statuses: `waiting`, `offered`, `accepted`, `declined`, `expired`, `left`, `removed`, `cancelled`).
- Audit actions use the `ride_waitlist.*` prefix (for example `ride_waitlist.joined`, `ride_waitlist.offered`, `ride_waitlist.expired`, `ride_waitlist.accepted`, `ride_waitlist.settings_updated`).

## Code And Tests

- Rules: `apps/web/src/lib/ride-waitlist-policy.ts`
- Database and processing: `apps/web/src/lib/ride-waitlists.ts`, `apps/web/src/lib/ride-waitlist-queue.ts`
- Tests: `apps/web/tests/ride-waitlist-policy.test.ts`
