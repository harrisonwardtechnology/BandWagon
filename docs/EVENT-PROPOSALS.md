# Event Proposals

Members can suggest an event for their organization. An organizer reviews it and, if it is approved, BandWagon publishes it as a normal event. Members never publish events directly. The feature is optional and **off by default** for every organization.

The longer write-up in [EVENTS.md](EVENTS.md#member-event-proposals) covers the same feature alongside manual and imported events. This page is the quick reference.

## What Members Do

- Open **Propose Event** in the app menu (`/app/event-proposals`).
- Choose an organization. The page says whether that organization accepts proposals from them, and why not if it does not.
- Fill in Event Name and Starts. Ends, Location Name, Address, Description, "About how many riders?", and Notes For Organizers are optional. The member form has no all day option.
- Track each proposal under Your Proposals. While it is waiting or has changes requested, they can **Withdraw** it. After a change request, they edit it and press **Update And Resend**.

The form warns that an approved event's address is visible to everyone who can see the event, so it asks for a public place, not a home address. Pickup spots are separate and follow [LOCATION-PRIVACY.md](LOCATION-PRIVACY.md).

## Who Can Propose

`proposalSubmitDenial` in `src/lib/event-proposal-policy.ts` allows a submission only when:

- The organization has the feature turned on.
- The person has an active membership in the organization.
- The person is an adult. Minors can never propose, whatever the setting. A parent can propose from their own account.
- If the organization chose "guardians only", the person is a guardian of an active student member of that organization.
- The session is not Support View.
- The person has sent fewer than 3 proposals to this organization in the last 24 hours and has fewer than 5 open (pending or changes requested). Resending after a change request does not count toward these limits.

Submissions take a Postgres advisory lock per member and organization, so the limits hold even with double clicks.

## What Organizers Do

Organization owners, admins, and managers use `/admin/event-proposals` (linked from `/admin/events`). Only owners and admins can change settings. Managers can review.

- **Proposal Settings:** **Let Members Propose Events** on or off, and **Who Can Propose**: Any Adult Member (default) or only parents and guardians of students in the organization.
- **Review Queue:** filter by Needs A Decision (default), Approved, Declined, Withdrawn, or All.
- **Approve And Publish:** the organizer can fix any detail, choose who can see the event (Everyone In The Organization, or Organizers Only which stores `private`), and choose whether ride requests are allowed. An optional note can be added.
- **Ask For Changes:** a note is required. The proposal goes back to the member.
- **Decline:** a reason is required and is shown to the member.

On approval the event is created with `createManualEvent` (`src/lib/events.ts`), the same code path as organizer events, inside the same transaction as the status change. The event records the organizer in `created_by_person_id` and credits the member in `events.proposed_by_person_id`. The start time is checked again at approval, so a proposal whose start time has already passed cannot be approved as is. The organizer must change the date first.

## Status Flow

```
pending --approve--> approved
pending --request changes--> changes_requested --resend--> pending
pending or changes_requested --decline--> declined
pending or changes_requested --withdraw--> withdrawn
```

`approved`, `declined`, and `withdrawn` are final. Each change locks the proposal row (`select ... for update`), so two organizers cannot act on it at once.

## Limits

| Field | Limit |
| --- | --- |
| Event name | 1 to 120 characters, required |
| Description | 2,000 characters |
| Location name | 160 characters |
| Address | 300 characters |
| Notes for organizers | 1,000 characters (only organizers see them) |
| Organizer note | 1,000 characters |
| Expected riders | Whole number, 0 to 500 |
| Start | In the future, at most 400 days ahead |
| Length | End after start, at most 72 hours |

HTML tags, comments, script and style blocks, and control characters are stripped from every text field.

## Notifications

Sent through `queueNotification`, so each person's notification preferences apply. Both types are routine: push, then email. Neither sends SMS.

- `event_proposal_submitted`: to the organization's active owners, admins, and managers when a proposal is sent or resent. The proposer is left out if they are also an organizer.
- `event_proposal_decision`: to the proposer when it is approved, declined, or sent back for changes.

Notification failures never block a saved proposal.

## Audit

Every step writes to `audit_events` with target type `event_proposal`: `event_proposal.submitted`, `event_proposal.resubmitted`, `event_proposal.withdrawn`, `event_proposal.approved`, `event_proposal.changes_requested`, and `event_proposal.declined`. Settings changes write `organization.event_proposal_settings_updated`. Approval also writes `organization.manual_event_created` with the proposal id in its metadata.

## How It Works

| Piece | Location |
| --- | --- |
| Tables | `organization_event_proposal_settings`, `event_proposals`, plus `events.proposed_by_person_id` (migration `060_event_proposals.sql`) |
| Pure rules | `src/lib/event-proposal-policy.ts` |
| Database work | `src/lib/event-proposals.ts` |
| Member API | `GET` and `POST /api/event-proposals` (`submit`, `resubmit`, `withdraw`) |
| Admin API | `GET` and `POST /api/admin/event-proposals` (`update-settings`, `approve`, `request-changes`, `decline`) |
| UI | `src/app/app/event-proposals/page.tsx`, `src/app/admin/event-proposals/page.tsx` |

Every proposal belongs to one organization, and every organizer query filters by organization id. If a member's account is deleted, `proposer_person_id` is cleared and the text stays for the organization's records.

Turning the feature off stops new submissions and resends. Proposals already in the queue can still be reviewed.

## Tests

`tests/event-proposals.test.ts` (14 tests) covers the module switch, the minor and guardians-only rules, Support View, rate limits, the state machine, who can moderate and change settings, input cleaning and limits, required notes, approval input and credit, that approval uses the manual event path inside the moderation transaction, audit on every decision, no em dashes in the UI copy, and that the migration keeps the feature off by default.
