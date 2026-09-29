# Trusted Household Members (Delegates)

A trusted adult, such as a grandparent, nanny, or co-parent in another home, can help with a family's rides without joining the household or the organization. In the code they are called household delegates. In the app they are called Trusted Adults.

The data model and the full permission rules are also in [ACCOUNTS-HOUSEHOLDS.md](ACCOUNTS-HOUSEHOLDS.md#trusted-household-delegates). This page is the quick reference for support and admins.

## What Guardians Do

On the Household page (`/app/household`), under Trusted Adults, a household manager (an adult with `can_manage_household`) can:

- **Invite A Trusted Adult** by email or mobile number, with an optional relationship label and end date.
- Choose **What They Can Do** (at least one permission) and **Which Children** (all minors in the household, or selected ones).
- **Edit** permissions, **Pause**, **Turn Back On**, or **Remove** a trusted adult.
- **Cancel Invitation** while an invite is waiting.
- See **Rides Waiting For Your OK** for requests a delegate made that still need a guardian, and a **History** of delegate activity.

A guardian can only give permissions they hold themselves, as a guardian, for every child the grant covers. This is checked when inviting, when editing, and again when the invite is accepted.

## What Delegates Can Do

| Permission | Allows |
| --- | --- |
| Ask for rides (`request_rides`) | Create ride requests, accept a driver's offer, cancel those rides, join or leave a carpool waitlist |
| Approve rides (`approve_rides`) | Approve or decline requests waiting for a guardian, accept a standby waitlist seat |
| See ride details (`view_ride_details`) | See ride status, driver, time, and the general pickup area |
| Get notifications (`receive_notifications`) | Receive ride updates for covered children |

Delegates use **Families You Help** on the same Household page. They see only the covered children, the organizations those children belong to that allow delegates, and upcoming events there.

## What Delegates Can Never Do

These are denied in `src/lib/household-delegate-policy.ts` no matter which permissions are set:

- Change guardians, add or remove children, or edit a child's profile or safety settings.
- Manage other delegates.
- See other households.
- Act for an adult, or for a child who is not in the household.

Delegates are never added to `memberships`, so they get no other organization access. Exact pickup addresses follow [LOCATION-PRIVACY.md](LOCATION-PRIVACY.md).

## Invitations

- The invite link is `/household-invite/<token>`. The token is 32 random bytes. Only its sha256 hash is stored. The page sends no referrer and is not indexed.
- Email invites are emailed. Phone invites are never texted, because the number has not agreed to texts. The guardian gets a link to share instead (**Share This Link**). The same happens if the invite email fails.
- Links are single use and expire after 7 days.
- A new invite to the same contact cancels the old one.
- The person accepting must be an adult with an active account and a verified contact, and must have the invited email or phone verified on their account. Household members cannot become delegates of their own household.
- Rate limits: 10 invites per inviter per hour, and 20 per household per day.

## Pause, Remove, And Cancelled Invites

- **Pause** and **Remove** take effect on the very next request. Every check reads fresh rows through `canActForChild` in `src/lib/child-access.ts`.
- Pausing or removing a delegate cancels every open invite in that household sent to any email or phone on that person's account. This stops a second invite (say, email and phone) from bringing access back.
- An invite can never turn a paused grant back on. An invite sent before the grant was paused or removed cannot be used. The guardian must send a new one.
- Accepting an invite cancels the person's other open invites for that household.
- The inviter must still manage the household when the invite is accepted. Deleting an account also cancels that person's open invites.
- A delegate can leave at any time with **Stop Helping This Family**. Household managers are told.
- An optional end date ends access automatically. No job is needed, because the check compares dates on every request.

## Organization Setting

Organizations can turn delegates off at `/admin/household-delegates` (**Allow Trusted Adults**, stored in `organizations.household_delegates_enabled`, default on). Organization owners, admins, and managers can change it. Platform `owner`, `support`, and `readonly` roles can view it. Turning it off blocks delegates in that organization but never affects guardians. The change is audited as `organization.household_delegates_updated`.

## Notifications And Audit

- Guardians are told when a delegate asks for, approves, declines, confirms, cancels, or updates a ride, or joins, leaves, accepts, or passes on a waitlist seat.
- Household managers are told when a delegate accepts or steps away.
- Delegates are told when their permissions change, or they are paused, turned back on, or removed.
- These use the `household_delegate_activity` type. It has no entry in the router's policy table, so it gets the default routine policy: push, then email, no SMS.
- Audit rows use `household_delegate.*` (for example `invited`, `accepted`, `updated`, `paused`, `resumed`, `revoked`, `left`, `ride_requested`, `standby_accepted`). Actions for a child set `audit_events.on_behalf_of_person_id` to the child.

## How It Works

| Piece | Location |
| --- | --- |
| Tables | `household_delegates`, `household_delegate_children`, `household_delegate_invitations`, plus `organizations.household_delegates_enabled` and `audit_events.on_behalf_of_person_id` (migration `061_household_delegates.sql`) |
| Pure rules | `src/lib/household-delegate-policy.ts` |
| Permission check | `src/lib/child-access.ts` (`canActForChild`) |
| Database work | `src/lib/household-delegates.ts` |
| Household API | `GET` and `POST /api/household/delegates` |
| Invite API | `POST /api/household/delegate-invitations` (`preview`, `accept`). The token is sent in the body, not the URL. |
| Admin API | `GET` and `POST /api/admin/household-delegates` |

## Tests

`tests/household-delegate-policy.test.ts` (21 tests) covers each permission, forbidden actions, paused, removed, expired, and not yet started grants, selected children, adult and active account rules, the organization switch, unchanged guardian rules, invite expiry and single use, rate limits, input checks, no em dashes in the UI copy, that ride checks all go through `canActForChild`, the "only give what you have" rule, and that pausing, removing, and accepting cancel open invites.
