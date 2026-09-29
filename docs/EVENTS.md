# BandWagon Events

BandWagon uses one normalized `events` table for all organization activities, regardless of source.

## Sources

- Google Calendar
- Microsoft Calendar
- Organizer-created manual BandWagon events

Imported provider records remain in `calendar_events` for traceability. They are then materialized into `events`, which is the model the ride workflow will use.

## Organization Ownership

A calendar connection must be assigned to an organization before imported events are normalized. This prevents a platform-level calendar connection from accidentally leaking events into the wrong tenant.

For a production organization:

1. Open `/admin/integrations/google` or `/admin/integrations/microsoft`.
2. Select the organization and connect the provider account with read-only calendar access.
3. Select the calendars the organization intends to publish.
4. Run a manual sync and verify sync health before enabling the scheduled sync endpoint.

Provider identifiers, selected calendars, sync health, and conflicts remain organization scoped. Google and Microsoft scheduled syncs use `CALENDAR_SYNC_CRON_SECRET`.

## Ride Coordination

Every normalized event has `ride_coordination_enabled`. The default is `true`, so the upcoming ride workflow can attach requests and driver offers directly to an event.

## Manual Events

Organization owners, administrators, and managers can create and edit manual events in `/admin/events`. Manual events use the same `events` table and therefore behave like imported events for rides, visibility, reminders, and notifications.

Ordinary members never publish events directly. They can suggest events through member event proposals when their organization turns that feature on (see below).

## Member Event Proposals

Member event proposals are an optional organization feature. It is **off by default**.

### Turning It On

1. An organization owner or admin opens `/admin/event-proposals` (also linked from `/admin/events`).
2. They check **Let members propose events** and choose who can propose:
   - **Any adult member** (default)
   - **Only parents and guardians of students in this organization**
3. They save. The change is recorded as `organization.event_proposal_settings_updated` in the audit log.

Managers can review proposals but cannot change these settings. Settings live in `organization_event_proposal_settings`.

### Who Can Propose

- Only people with an active membership in the organization.
- Only adults. Minors can never propose, whatever the setting. A parent or guardian can propose on a student's behalf from their own account.
- Nobody can propose from Support View.
- Limits: 3 new proposals per member per organization in any 24 hours, and at most 5 waiting for review at once. Resending after a change request does not count against these limits.

The rules live in `src/lib/event-proposal-policy.ts` (pure, tested in `tests/event-proposals.test.ts`).

### What A Proposal Contains

Event name (120 characters), description (2,000), start and optional end time, location name (160) and address (300), about how many riders (0 to 500), and notes for organizers (1,000, only organizers see them). HTML is stripped from every text field. The start must be in the future and within 400 days, and an event can last up to 72 hours.

Location privacy: an approved event's address is visible to everyone who can see the event, so the form asks for a public place (school, field, park) and warns against home addresses. Pickup and drop-off spots stay in `private_locations` and follow the rules in `LOCATION-PRIVACY.md`.

Members submit and track proposals at `/app/event-proposals`.

### Review Workflow

Organization owners, admins, and managers see a review queue at `/admin/event-proposals`. For each proposal they can:

- **Approve and publish.** The moderator can fix any detail and choose who can see the event and whether ride requests are allowed. The event is created with `createManualEvent`, the same code path as organizer-created manual events, inside the same database transaction as the status change. The event records the moderator in `created_by_person_id` and credits the member in `events.proposed_by_person_id`. From then on it follows normal event visibility, rides, and reminders.
- **Ask for changes.** A note is required. The member edits the proposal and resends it, which puts it back in the queue.
- **Decline.** A reason is required and is shown to the member.

Members can withdraw a proposal while it is waiting for review or has changes requested.

Status flow:

```
pending --approve--> approved
pending --request changes--> changes_requested --resend--> pending
pending | changes_requested --decline--> declined
pending | changes_requested --withdraw--> withdrawn
```

`approved`, `declined`, and `withdrawn` are final. Each decision locks the proposal row (`select ... for update`), so two organizers cannot act on the same proposal at once.

### Notifications

Sent through the normal notification pipeline (`queueNotification`), so members' notification preferences apply:

- `event_proposal_submitted`: to the organization's owners, admins, and managers when a proposal is sent or resent.
- `event_proposal_decision`: to the proposer when it is approved, declined, or sent back for changes.

Both are routine (push, with email as a fallback). Neither sends SMS.

### Audit

Every step writes to `audit_events` with `target_type='event_proposal'`: `event_proposal.submitted`, `event_proposal.resubmitted`, `event_proposal.withdrawn`, `event_proposal.approved`, `event_proposal.changes_requested`, and `event_proposal.declined`. Approval also writes the usual `organization.manual_event_created` entry with the proposal id in its metadata.

### Data

Tables: `organization_event_proposal_settings` and `event_proposals` (migration `060_event_proposals.sql`). Every proposal belongs to one organization, and every moderator query filters by organization id. If a member's account is deleted, `proposer_person_id` is cleared and the proposal text remains for the organization's records.

## Multi-tenant Safety

Every normalized event requires an `organization_id`. Provider identifiers are unique only within an organization/source/calendar tuple, which prevents cross-tenant collisions.
