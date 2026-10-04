# Event Proposals

Members can suggest events for their organization. Members never publish events directly: an organizer reviews each proposal and approves, asks for changes, or declines it. Migration `060_event_proposals.sql` adds the tables. The technical reference also lives in [EVENTS.md](EVENTS.md#member-event-proposals).

## Where It Lives

- Members: `/app/event-proposals` ("Propose An Event" and "Your Proposals"). API `/api/event-proposals`.
- Organizers: `/admin/event-proposals` ("Proposal Settings" and "Review Queue"). API `/api/admin/event-proposals`.

## Turning It On

- The feature is **off by default** for every organization.
- Organization owners and admins turn it on at `/admin/event-proposals` and choose who can propose:
  - **Any adult member** (`adult_members`, the default)
  - **Only parents and guardians** of students in the organization (`guardians_only`)
- Managers can review proposals but cannot change these settings. The trusted adult setting at `/admin/household-delegates` follows the same owners-and-admins rule.
- Each settings change writes the audit event `organization.event_proposal_settings_updated`.

## Who Can Propose

- Active members of the organization only.
- Adults only. Minors are always refused; a parent or guardian can propose instead.
- Not from Support View.
- Limits per member per organization:
  - 3 new proposals in any rolling 24 hours
  - 5 proposals waiting for review at once
  - Resending after a change request does not count against these limits.

## What A Proposal Contains

- Event name (required, up to 120 characters)
- Description (up to 2,000)
- Start time (required, in the future, within 400 days) and optional end time (after the start, at most 72 hours later)
- All-day flag
- Location name (up to 160) and address (up to 300)
- Expected riders (0 to 500)
- Notes for organizers (up to 1,000)

HTML and control characters are stripped from every text field.

## Review Flow

Organization owners, admins, and managers (org-wide roles) can review. Platform staff with admin access can too.

| Action | From | Result |
| --- | --- | --- |
| Approve | Waiting for review | Approved and published |
| Ask for changes (note required) | Waiting for review | Changes requested |
| Resend (member) | Changes requested | Waiting for review |
| Decline (reason required) | Waiting for review or changes requested | Declined |
| Withdraw (member) | Waiting for review or changes requested | Withdrawn |

Approved, declined, and withdrawn are final. Each decision locks the proposal row, so two organizers cannot act on the same proposal at once.

## Stale Proposals

**Start time has passed.** A proposal that sat in the queue past its own start time cannot be published as it is. In the review queue its "When" line says so, and Approve answers:

> This proposal's start time has already passed. Change the date and time to approve it, or decline it.

The organizer can pick a new date in the approval form and approve, ask the proposer for changes, or decline.

**Proposals turned off with some still queued.** Turning the feature off never deletes or changes a proposal. Queued proposals (waiting for review or changes requested) are **on hold**:

- They stay in the review queue so nothing looks lost.
- Approve and Ask For Changes are refused with "Event proposals are turned off for this organization, so this proposal is on hold. Turn proposals back on to approve it or ask for changes, or decline it now." So no member-proposed event is published while the feature is off.
- Decline still works, so the queue can be cleared.
- Members cannot send or resend while it is off. They can still withdraw.
- The admin who turns it off is told how many are waiting ("Event proposals are off. 3 proposals are still in the queue. They're on hold, not deleted: ..."), and the count is stored in the settings audit event (`openProposals`).
- Turning proposals back on puts everything back to normal with the queue intact.

The rules are `proposalModerationBlock` and `proposalsOffNotice` in the policy file.

## What Happens On Approval

- The moderator can edit the name, description, location, times, and all-day flag before publishing, and chooses visibility (organization or private) and whether ride requests are allowed (on unless turned off).
- The event is created with `createManualEvent`, the same code path organizers use, in the same database transaction as the status change.
- The moderator is recorded as the event creator. The member is credited in `events.proposed_by_person_id`.
- The proposal stores the new event id in `approved_event_id`.
- From then on it is a normal event for visibility, rides, and reminders.

## Notifications

Sent through `queueNotification`, so notification preferences apply. Both types are routine (push, then email). Neither sends SMS.

- `event_proposal_submitted`: to the organization's owners, admins, and managers (except the proposer) when a proposal is sent ("New event proposal") or resent ("Event proposal updated"). Links to the review queue.
- `event_proposal_decision`: to the proposer when it is approved, declined, or sent back for changes. Links to `/app/event-proposals`.

A notification failure never blocks saving the proposal.

## Audit

Every step writes to `audit_events` with `target_type='event_proposal'`:

- `event_proposal.submitted`, `event_proposal.resubmitted`, `event_proposal.withdrawn`
- `event_proposal.approved`, `event_proposal.changes_requested`, `event_proposal.declined`

Approval also writes the normal manual event audit entry, with the proposal id in its metadata.

## Tables

- `organization_event_proposal_settings`: `enabled`, `proposer_scope`
- `event_proposals`: proposal fields, `status`, `moderator_note`, `decided_by_person_id`, `decided_at`, `approved_event_id`
- `events.proposed_by_person_id`: credit for the proposer

## Code And Tests

- Rules: `apps/web/src/lib/event-proposal-policy.ts`
- Database and notifications: `apps/web/src/lib/event-proposals.ts`
- Tests: `apps/web/tests/event-proposals.test.ts`
