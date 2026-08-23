# BandWagon Events

BandWagon uses one normalized `events` table for all organization activities, regardless of source.

## Sources

- Google Calendar
- Microsoft calendar (planned)
- Manual BandWagon events

Imported provider records remain in `calendar_events` for traceability. They are then materialized into `events`, which is the model the ride workflow will use.

## Organization ownership

A calendar connection must be assigned to an organization before imported events are normalized. This prevents a platform-level calendar connection from accidentally leaking events into the wrong tenant.

For the current FloMoGo deployment:

1. Open `/admin/events`.
2. Select FloMoGo.
3. Click **Bind Active Google Connection** once.
4. Click **Normalize Imported Events** or run the normal Google calendar sync.

After that, future admin and cron Google syncs normalize automatically.

## Ride coordination

Every normalized event has `ride_coordination_enabled`. The default is `true`, so the upcoming ride workflow can attach requests and driver offers directly to an event.

## Manual events

Manual events use the same `events` table and therefore behave exactly like imported events for rides, visibility, reminders, and notifications.

## Multi-tenant safety

Every normalized event requires an `organization_id`. Provider identifiers are unique only within an organization/source/calendar tuple, which prevents cross-tenant collisions.
