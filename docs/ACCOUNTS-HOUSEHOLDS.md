# BandWagon Accounts & Households

BandWagon models a household separately from an organization. A family can therefore participate in more than one BandWagon organization without duplicating its people or contact information.

## Core model

- `people` is the person profile.
- `user_accounts` is the sign-in identity for a person who can authenticate.
- `households` represents a family/household.
- `household_members` links people to a household and assigns manager/adult/student/dependent roles.
- `guardian_relationships` explicitly records which adults may manage a minor profile and approve rides.
- `memberships` links a person to an organization such as FloMoGo.
- `emails` stores verified email addresses.
- `phones` stores the E.164 phone encrypted with `DATA_ENCRYPTION_KEY`; only a keyed lookup hash is searchable.
- `organization_join_codes` provides the foundation for self-service organization enrollment.

## Privacy rules

Phone numbers are encrypted at rest using AES-256-GCM and are never stored in plaintext. Email and phone visibility remain hidden by default. The notification router resolves a verified phone internally only when SMS/RCS is actually required.

## Parent / student behavior

Students default to `student_approval_required=true`. A guardian relationship records whether the adult can approve rides and manage the student's profile. This is intentionally separate from household membership so custody/guardian arrangements do not have to be inferred from a shared household.

## Multi-tenant behavior

A household is platform-level, not owned by one organization. Each person joins organizations independently through `memberships`. This allows the same household to participate in FloMoGo and another future tenant without maintaining duplicate family records.

## Trusted household delegates

A trusted household delegate is an adult outside the household, such as a grandparent, nanny, or co-parent in another home, who can help with a family's rides. Migration `061_household_delegates.sql` adds the model.

### Tables

- `household_delegates` is one grant per household and delegate. It stores the scopes the guardian chose (`can_request_rides`, `can_approve_rides`, `can_view_ride_details`, `can_receive_notifications`), `child_scope` (`all` or `selected`), an optional `ends_at`, and `status` (`active`, `paused`, `revoked`). Revoked rows are kept as history; only one live grant per household and delegate is allowed.
- `household_delegate_children` lists the children covered when `child_scope='selected'`.
- `household_delegate_invitations` holds single-use invite links. Only a sha256 hash of the token is stored. Phone invites store the keyed phone lookup hash, never the number. Invites expire after 7 days.
- `organizations.household_delegates_enabled` (default `true`) lets an organization turn delegates off.
- `audit_events.on_behalf_of_person_id` records the child when someone acts for them. `actor_person_id` is the delegate.

### Who can do what

A household manager (an adult with `can_manage_household`) invites, edits, pauses, turns back on, and removes delegates from the Household page. A delegate can also step away on their own.

| Scope | Allows |
| --- | --- |
| Ask for rides | Create ride requests for covered children, accept a driver's offer, cancel those rides |
| Approve rides | Approve or decline requests waiting for a guardian's OK |
| See ride details | See ride status, driver, time, and the general pickup area |
| Get notifications | Receive ride updates (confirmed, driver on the way, arrived, cancelled) |

Delegates can never change guardians, add or remove children, change a child's profile or safety settings, manage other delegates, or see other households. These actions are denied in the policy no matter which scopes are set. Exact pickup addresses stay under the existing location privacy rules; a delegate sees an exact address only for a place they entered.

A delegate who can ask for rides but not approve them creates requests that still wait for a guardian when the child requires approval. Guardians see those under "Rides waiting for your OK" on the Household page.

### Invitations

- The invitee must be an adult (`person_type='adult'`, not a 13 to 17 or under 13 age band) with an active account and a verified email or phone. This is the same adult rule used for organization owners and admins.
- Email invites are emailed. Phone invites return a link for the guardian to share, because BandWagon does not text numbers that have not agreed to texts.
- The accepting account must have the invited email or phone verified. Household members cannot become delegates of their own household.
- Links are single use (row lock plus `accepted_at` check), expire in 7 days, and a new invite to the same contact cancels the old one.
- Rate limits: 10 invites per inviter per hour and 20 per household per day.

### Permission checks

`src/lib/child-access.ts` exports `canActForChild(identity, childId, action, { organizationId })`. It is the only place that decides whether someone may request, approve, or manage rides for a child, and it reads fresh rows on every call, so pausing or removing a delegate takes effect on the very next request. The pure rules live in `src/lib/household-delegate-policy.ts` and are covered by `tests/household-delegate-policy.test.ts`.

Callers: `rides.ts` (request membership fallback, auto approval, guardian approval, accepting offers), `carpool.ts` (pooling), `ride-lifecycle.ts` (cancelling and other rider updates), `location-privacy.ts` (setting ride places), and `product.ts` (the signed-in ride actions). Guardian meanings are unchanged: requesting uses `can_manage_profile`; approving and managing requests use `can_approve_rides`.

### Organizations

Delegates are never added to `memberships`. When a delegate is not a member of the child's organization, the product layer lets the specific child-scoped action through only when `canActForChild` grants it through a delegate grant and the organization allows delegates. They get no other organization access. Organization admins can turn delegates off at `/admin/household-delegates`; guardians are not affected.

### Notifications and audit

- Household managers are notified when a delegate accepts or steps away.
- Guardians are notified when a delegate asks for, approves, declines, confirms, cancels, or otherwise updates a ride.
- Delegates are notified when their permissions change, are paused, or are removed, and (with the notifications scope) about ride updates for covered children.
- Audit actions use the `household_delegate.*` prefix. The Household page shows this history to the household manager.

## Admin development console

After applying migration `007_accounts_households.sql`:

`/admin/accounts`

The console can create a test household, parent/manager, student, verified contact methods, FloMoGo memberships and guardian relationships. It requires a signed-in platform owner and is intended for development/testing, not end-user production onboarding.

## Next authentication work

The production onboarding flow will replace the admin console with:

1. Email or phone verification.
2. Parent account creation.
3. Household creation or join.
4. Student/dependent creation.
5. Organization join code.
6. Parent approval preferences.
7. Push enrollment.

The database model is designed so those flows can be added without changing the household/guardian structure.
