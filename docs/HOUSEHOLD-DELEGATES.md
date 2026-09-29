# Household Delegates (Trusted Adults)

A trusted adult is someone outside the household, such as a grandparent, nanny, or co-parent in another home, who can help with a family's rides within limits the parent chooses. In the app they are called **Trusted Adults**. Migration `061_household_delegates.sql` adds the model. The full technical reference is in [ACCOUNTS-HOUSEHOLDS.md](ACCOUNTS-HOUSEHOLDS.md#trusted-household-delegates).

## Where It Lives

- Parents: **Trusted Adults** section on the Household page (`/app/household`). API `/api/household/delegates`.
- Invitees: `/household-invite/<token>` ("Become A Trusted Adult"). API `/api/household/delegate-invitations`.
- Organization admins: `/admin/household-delegates`.

## Invite Flow

1. A household manager (an adult with `can_manage_household`) picks what the trusted adult can do, which children it covers (all or selected), an optional end date, and a relationship label.
2. They enter an email address or a mobile number.
3. **Email invites** are emailed with the link. **Phone invites** are never texted, because BandWagon does not text numbers that have not agreed to texts. The parent gets the link to share. The same happens if email is not set up.
4. The invitee opens `/household-invite/<token>`, signs in, and taps **Accept Invitation**.
5. The accepting account must:
   - be an adult with an active account,
   - have the invited email or phone verified on the account,
   - not already be a member of that household.
6. On acceptance the grant becomes active, the person's other open invites for that household are cancelled, and the inviter and household managers are notified.

## Invite Rules And Limits

- Links are single use and expire after **7 days**.
- Only a sha256 hash of the token is stored. Phone invites store a keyed lookup hash, never the number.
- A new invite to the same contact cancels the older open one.
- Rate limits: **10 invites per inviter per hour** and **20 per household per day**.
- You cannot invite yourself.

## What A Delegate Can Do

| Permission | Allows |
| --- | --- |
| Ask for rides | Create ride requests for covered children, accept a driver's offer, cancel, join or leave a carpool waitlist, pass on a standby seat |
| Approve rides | Approve or decline requests waiting for a guardian, accept a standby seat |
| See ride details | See ride details and pickup information |
| Get notifications | Receive notifications about covered children's rides |

At least one permission must be chosen. A delegate can **never** manage guardians, add or remove children, edit a child's profile or safety settings, manage other delegates, or see other households.

## Grant Rights Checks

A parent can only give permissions they hold themselves, as a guardian, for every child the grant covers:

- "Ask for rides" needs their own guardian request right (`can_manage_profile`).
- "Approve rides" needs their own `can_approve_rides`.
- Any permission needs a guardian relationship with that child.
- The parent's own delegate grants for other families never count.

This is checked when inviting, when editing, and again when the invite is accepted. If the inviter lost a right in the meantime, acceptance fails with "The person who invited you can no longer give these permissions."

## Pause, Resume, Revoke, And Leave

- **Pause**: access stops on the very next request, because every check reads the grant fresh.
- **Resume**: turns access back on. The pause time is kept so older invites stay unusable.
- **Remove (revoke)**: ends the grant. Revoked rows stay as history. To restore access, send a new invite.
- **Leave**: a delegate can step away on their own. Household managers are notified.
- On pause, revoke, or leave, every open invite in that household sent to any email or phone on the delegate's account is cancelled, so a second invite cannot bring access back.
- An invite can never turn a paused grant back on, and an invite sent before a pause or removal cannot be used.
- The inviter must still manage the household when the invite is accepted.
- The delegate is notified when permissions change, or access is paused, resumed, or removed.

## Organization Controls

- Delegates are not organization members and get no other organization access.
- `organizations.household_delegates_enabled` (default on) lets an organization turn delegates off at `/admin/household-delegates`. The change is audited as `organization.household_delegates_updated`.

## Audit And Notifications

- Management actions: `household_delegate.invited`, `.updated`, `.paused`, `.resumed`, `.revoked`, `.accepted`, `.left`.
- Ride actions by a delegate record the delegate as `actor_person_id` and the child in `audit_events.on_behalf_of_person_id` (for example `household_delegate.ride_requested`, `.ride_approved`, `.waitlist_joined`, `.standby_accepted`).
- Guardians get a `household_delegate_activity` notification for each ride action a delegate takes.
- The household manager sees this history on the Household page.

## Code And Tests

- Rules: `apps/web/src/lib/household-delegate-policy.ts`
- Permission checks: `apps/web/src/lib/child-access.ts` (`canActForChild`)
- Database, invites, notifications: `apps/web/src/lib/household-delegates.ts`
- Tests: `apps/web/tests/household-delegate-policy.test.ts`
