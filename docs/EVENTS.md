# BandWagon Events

BandWagon uses one normalized `events` table for all organization activities, regardless of source.

## Sources

- Google Calendar
- Microsoft Calendar
- Organizer-created manual BandWagon events

Imported provider records remain in `calendar_events` for traceability. They are then materialized into `events`, which is the model the ride workflow will use.

## Organization ownership

A calendar connection must be assigned to an organization before imported events are normalized. This prevents a platform-level calendar connection from accidentally leaking events into the wrong tenant.

For a production organization:

1. Open `/admin/integrations/google` or `/admin/integrations/microsoft`.
2. Select the organization and connect the provider account with read-only calendar access.
3. Select the calendars the organization intends to publish.
4. Run a manual sync and verify sync health before enabling the scheduled sync endpoint.

Provider identifiers, selected calendars, sync health, and conflicts remain organization scoped. Google and Microsoft scheduled syncs use `CALENDAR_SYNC_CRON_SECRET`.

## Ride coordination

Every normalized event has `ride_coordination_enabled`. The default is `true`, so the upcoming ride workflow can attach requests and driver offers directly to an event.

## Manual events

Organization owners, administrators, and managers can create and edit manual events in `/admin/events`. Manual events use the same `events` table and therefore behave like imported events for rides, visibility, reminders, and notifications.

Ordinary members cannot publish events in v1. Member-created proposals are deferred until an organization-controlled moderation policy is designed; direct member publishing will not be the default.

## Multi-tenant safety

Every normalized event requires an `organization_id`. Provider identifiers are unique only within an organization/source/calendar tuple, which prevents cross-tenant collisions.
