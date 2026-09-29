# Ride Waitlists

When a carpool is full, a rider can join its waitlist instead of being turned away. When a seat opens, the next person in line gets a standby offer that they must accept within a set time. The seat workflow in context is also described in [RIDE-WORKFLOW.md](RIDE-WORKFLOW.md#waitlists).

## What Riders And Families See

- **Join Waitlist** appears on full carpools under Upcoming Carpools on `/app/rides`. A carpool counts as full when its free seats, minus seats held by open offers, are fewer than the rider needs.
- Riders see their place in line and how many people are waiting. They never see other riders' names.
- When a seat opens, the rider gets "A seat opened up" with the minutes left and the deadline. The rides page shows a countdown in plain words (for example "4 minutes 30 seconds left to accept").
- They can press **Accept Seat** or **Pass**, or **Leave Waitlist** at any time. Open entries are listed under Your Waitlists.
- Ended entries stay visible for 3 days so people can see what happened.

Who can act for an entry:

- Adults act for themselves.
- A guardian can join, leave, accept, or pass for a minor, using the normal guardian rules.
- A trusted household delegate with "Ask for rides" can join and leave. Accepting a seat also needs "Approve rides". See [HOUSEHOLD-DELEGATES.md](HOUSEHOLD-DELEGATES.md).

## Who Can Join

`canJoinWaitlist` in `src/lib/ride-waitlist-policy.ts` requires all of these:

- The person acting and the rider are active members of the organization (or the actor is a delegate with a live grant).
- The organization has waitlists turned on.
- The carpool is `confirmed` and open to pooling.
- Departure is not past the organization's cutoff.
- The rider is not already in this carpool, not already on its waitlist, and not seated in another carpool for the same event and an overlapping direction.
- The carpool really is full for the seats needed.
- The rider is not the driver.

Each entry is backed by a normal ride request. An open request for the same event and direction is reused. Otherwise a new one is created, so guardian approval works exactly as it does for any seat request. A rider still waiting on guardian approval keeps their place but is skipped for offers.

## How Offers Are Made

A seat can open when a passenger is removed, the driver adds seats, or a new carpool is created for the same event and direction. Each of these enqueues a `waitlist.process_ride` job (`src/lib/ride-waitlist-queue.ts`). Processing, in `processRideWaitlist` (`src/lib/ride-waitlists.ts`):

1. Locks the ride row (`SELECT ... FOR UPDATE`).
2. Expires offers whose time is up, using the database clock.
3. Works out free seats: capacity, minus confirmed seats, minus seats held by open offers.
4. Walks the line in join order (FIFO, id as tie breaker). People waiting on another carpool for the same event and direction are included.
5. Ends entries that can never be offered (left the organization, guardian denied, seated elsewhere, request closed). Skips entries still waiting on approval or needing more seats than are free. A smaller party behind a larger one can take a seat so it is not left empty.
6. Makes offers and schedules a `waitlist.offer_expire` job at each offer's expiry, deduped as `waitlist-offer-expire:<entry>:<offer round>`.

Candidates are picked with `SKIP LOCKED`, so two workers on sibling carpools never offer one person twice.

## How Offers Expire

- The offer window is the organization setting (default 30 minutes).
- Near departure the window shrinks to at most half the time left before the cutoff, so the next person still has time.
- An offer never runs past the cutoff. No offer is made once fewer than 3 minutes remain.
- When an offer expires or is passed, the seat goes to the next person in line.

## Accepting A Seat

Accepting runs in one transaction. It locks the ride, then the entry, then the request, and re-checks that the offer is live, the seat is still free, guardian approval is in place, and the rider is still an active member. It then seats the rider with the same code as manual pooling (`reserveSeatForRequest` in `src/lib/carpool.ts`). The rider's other active waitlist entries for the same event and direction are cancelled, and any seats they held are released to the next person.

## Closing A Waitlist

When the carpool is cancelled, leaves, finishes, or its departure time passes, the waitlist is cleared and everyone on it is told why. If an organization turns waitlists off, every open waitlist in it is cleared. Offers on a closed carpool for people waiting elsewhere go back to "waiting" on their own carpool.

## Admin And Driver Controls

- Organization owners, admins, and managers use `/admin/waitlists` (linked from `/admin/operations`). Platform `owner`, `support`, and `readonly` roles can view it.
- Settings, stored in `organization_waitlist_settings` (a missing row means defaults):

| Setting | Default | Range |
| --- | --- | --- |
| Waitlists on | On | On or off |
| Minutes to accept (`offer_window_minutes`) | 30 | 5 to 240 |
| Departure cutoff (`departure_cutoff_minutes`) | 15 | 0 to 240 |

- The admin page lists every open waitlist (up to 500 entries) and a 30 day count by status.
- Drivers see their carpool's waitlist: display name, seats needed, generalized pickup area, and whether a seat is on offer. No contact details or exact addresses. Drivers can change their seat count (1 to 12). Adding seats wakes the waitlist.

## Jobs And Routes

| Piece | Details |
| --- | --- |
| Tables | `organization_waitlist_settings`, `ride_waitlist_entries` (migration `059_ride_waitlists.sql`) |
| Worker jobs | `waitlist.process_ride`, `waitlist.offer_expire` (`src/lib/worker.ts`) |
| Scheduled task | `ride-waitlists` every 5 minutes, a safety net for late expiries and missed seats (`src/lib/scheduled-tasks.ts`). Platform Health flags it if it is older than 20 minutes. |
| Member actions | `POST /api/product` with `join_waitlist`, `leave_waitlist`, `accept_standby`, `decline_standby`, `update_ride_seats` |
| Admin API | `GET` and `POST /api/admin/waitlists` (`update-settings`) |
| UI | `src/components/waitlist-panels.tsx`, `src/app/admin/waitlists/page.tsx` |

A unique index allows one active entry per rider per carpool. A check constraint requires an expiry and a seat for every `offered` entry.

## Notifications And Audit

- `waitlist_offer` is "important": push first, with email fallback. SMS fallback is allowed, but the default preference only texts for critical messages, so most people get push or email.
- `waitlist_update` (joined, expired, removed, closed) is routine: push, then email. No SMS.
- A cancelled carpool uses `last_minute_cancellation`, which is critical and can text right away.
- For a minor, notices go to the guardian or delegate who asked, if they still have access, plus delegates with the notifications permission. Adults are told directly.
- All go through the normal router, so preferences, SMS consent, and organization texting limits apply.
- Audit rows use `ride_waitlist.<action>` with target type `ride_waitlist_entry`: `joined`, `left`, `offered`, `accepted`, `declined`, `expired`, `offer_withdrawn`, `closed`, `removed`, `cancelled`, plus `ride_waitlist.settings_updated`.

## Tests

`tests/ride-waitlist-policy.test.ts` (16 tests) covers default settings, FIFO order, offer windows near departure, who is skipped or ended, seat planning, expiry dedupe keys, join and accept checks, countdown text, no em dashes in notification copy, the ride row lock and `SKIP LOCKED`, the migration's unique index, and that the worker and scheduler handle the jobs.
