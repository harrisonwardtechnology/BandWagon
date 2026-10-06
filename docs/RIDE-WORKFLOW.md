# BandWagon Ride Workflow

The ride engine is organization-scoped and event-aware. It deliberately separates a **ride request** from a **driver offer** and the final **ride** so multiple drivers can offer without exposing unnecessary personal information.

## Core lifecycle

```text
Request
  → guardian approval when required
  → Open
  → Driver Offer(s)
  → Offer Accepted
  → Confirmed Ride
  → Driver En Route
  → Arrived
  → Picked Up
  → Completed
```

Cancellation and no-show states are recorded explicitly rather than deleting records.

## Minor / guardian behavior

A minor with `student_approval_required=true` cannot create an immediately open ride request unless the requester is a guardian with `can_approve_rides=true`.

A student-created request becomes `pending_approval`. Drivers cannot offer against it until an authorized guardian approves it.

## Driver offers

A ride request can have several offers. Accepting one offer happens in a database transaction:

1. Lock the request.
2. Verify it is still open.
3. Verify the accepting person is the requester or authorized guardian.
4. Lock the selected offer.
5. Create the ride.
6. Add the passenger.
7. Mark the request matched.
8. Accept the selected offer and decline remaining open offers.
9. Write the status/audit event.

This prevents two offers from being accepted for the same request during a race.

## Waitlists

When a carpool is full, a rider (or a guardian for a minor) can join its waitlist instead of being turned away. Code: `src/lib/ride-waitlists.ts` (database work), `src/lib/ride-waitlist-policy.ts` (pure rules, unit tested), migration `059_ride_waitlists.sql`.

### Joining

- "Join Waitlist" appears on full carpools under **Upcoming Carpools** in `/app/rides`. A carpool is full when its free seats, minus seats held for open standby offers, are fewer than the rider needs.
- Every entry is backed by a normal ride request. An open request for the same event and direction is reused (so its pickup address is kept); otherwise one is created with the usual guardian approval rules. A minor whose request is still waiting for guardian approval keeps a place in line but is not offered a seat until a guardian approves.
- Line order is first come, first served by join time.
- A rider cannot join twice (unique index on ride and rider for active entries), cannot join a carpool they are already in, and cannot join when they already have a seat in another carpool for the same event and an overlapping direction. Joining closes at the departure cutoff.
- Riders see their place in line and the size of the waitlist. They do not see other riders' names.

### Standby offers

A seat can open when a passenger is removed, the driver adds seats, or a new carpool is created for the same event and direction. Each of these enqueues a `waitlist.process_ride` job. Processing:

1. Locks the ride row (`SELECT ... FOR UPDATE`). Every waitlist change goes through this lock, so any number of web and worker instances can run at once.
2. Expires offers whose time is up (database clock).
3. Counts free seats: capacity, minus confirmed seats, minus seats held by open offers.
4. Walks the line in join order (`FOR UPDATE SKIP LOCKED` on entries). People waiting on this carpool and people waiting on other carpools for the same event and direction are both considered. A party that needs more seats than are free keeps its place while a smaller party behind it may take the seat.
5. Takes people out of line who can never be offered a seat: removed from the organization, request closed or denied, or already seated in another carpool for the event.
6. Makes offers. Each offer schedules a `waitlist.offer_expire` job at the expiry time with the dedupe key `waitlist-offer-expire:<entry>:<offer round>`.

**Offer window.** The organization window (default 30 minutes) applies when departure is far away. Close to departure the window is at most half of the time left before the cutoff, so a pass or expiry still leaves time for the next person. Offers never run past the cutoff (default 15 minutes before departure), and no offer is made with less than 3 minutes left. Departure is the ride's scheduled pickup, else the primary request's pickup time, else the event start.

**Accept** runs in one transaction: lock the ride, then the entry, then the request; re-check that the offer has not expired, the seat is still free, the guardian approval is in place, and the rider is still an active member; then add the rider with the same seat logic as manual pooling. Manual pooling also counts held seats, so an offer cannot be double booked. After accepting, the rider's other active waitlist entries for the same event and direction are cancelled and any seats they held are released.

**Pass (decline) or expiry** ends the entry and the next eligible person is offered the seat right away. **Leave** ends the entry at any time; leaving with an offer in hand releases the seat.

**Closing.** When the carpool is cancelled, departs, finishes, or the departure time passes, its waitlist is cleared and everyone on it is told why. If the organization turns waitlists off, all open waitlists are cleared.

A `ride-waitlists` scheduled task runs every 5 minutes as a safety net (late expiries, missed seat openings, departed carpools).

### Drivers and organizers

- The driver sees the waitlist count and list on their carpool card: display name, seats needed, generalized pickup area, and whether a seat is currently offered. This is the same information drivers already see on open ride requests. The driver can change the number of seats in the car; adding seats wakes the waitlist.
- Organization admins manage settings and see every open waitlist at `/admin/waitlists`: waitlists on or off (default on), minutes to accept (5 to 240, default 30), and the departure cutoff (0 to 240 minutes, default 15).

### Notifications and audit

- Offers use the `waitlist_offer` type (important: push first, then email if push is not available; a text only for people who agreed to texts and turned off "SMS for critical only"). Joined, expired, removed, and closed use `waitlist_update` (routine, never texted). A cancelled carpool uses `last_minute_cancellation` (critical), which texts every waitlisted rider who agreed to texts. Details: [WAITLISTS.md](WAITLISTS.md#notifications-sent). All go through the normal router, so notification preferences, SMS consent, opt-outs, and organization texting limits apply. Minors' households are notified through the guardian who asked.
- Audit events use `ride_waitlist.<action>` with `target_type='ride_waitlist_entry'`: `joined`, `left`, `offered`, `accepted`, `declined`, `expired`, `offer_withdrawn`, `closed`, `removed`, `cancelled`, and `settings_updated`.

## Notifications

The workflow uses the notification router rather than calling Twilio or Push directly.

- Driver offer → push-first notification to requester.
- Ride matched → notification to requester and driver.
- Driver en route / arrived → critical driver-arriving routing.
- Cancellation → critical cancellation routing.

Verified encrypted phone numbers are resolved by the notification layer only when SMS/RCS is actually required.

## Privacy

The initial workflow stores pickup/drop-off **notes**, not public street addresses. The upcoming location/privacy milestone will add encrypted precise locations plus generalized map areas for discovery. Drivers should not receive a precise address until a ride is matched and the user's visibility policy permits it.

## Admin development console

`/admin/rides`

Sign in as a platform owner to exercise the development workflow. The console no longer accepts the shared bootstrap token.

## Next layers

- Encrypted pickup/drop-off locations and polygon/generalized visibility
- Driver capacity and willingness zones
- Multi-passenger grouping
- Public parent/student/driver UI
- 24-hour and 1-hour scheduled reminders
- Pickup/drop-off confirmation buttons
- No-show handling and admin reporting
