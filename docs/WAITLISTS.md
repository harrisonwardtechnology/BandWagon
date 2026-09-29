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

| Event | Type |
| --- | --- |
| Joined, offer expired, removed, waitlist closed | `waitlist_update` (routine, push then email) |
| A seat opened, with minutes left and deadline | `waitlist_offer` (important, push then email, SMS/RCS fallback if preferences allow) |
| Seat confirmed (rider) and open seat filled (driver) | `ride_matched` |
| Carpool cancelled | `last_minute_cancellation` |

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
