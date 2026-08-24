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
