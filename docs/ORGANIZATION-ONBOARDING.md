# Organization Onboarding

BandWagon is free for organizations. Anyone with a BandWagon account can ask to start a community; the platform owner reviews each request before a tenant exists. This replaces creating every organization by hand in `/admin/tenants` (that page still works for manual setups).

## Flow at a glance

1. **Request** (`/start`). A signed-in user fills in the organization name, web address (`slug.<TENANT_BASE_DOMAIN>`), type, city/state, approximate families, their role, optional sponsor and website, how rides would work, and accepts the Organization Agreement (`/legal/organization-agreement`, version `2026-09-26-draft`). The address is checked live against the reserved list, existing tenants and other pending requests.
2. **Notify.** The platform owner gets an email at `PLATFORM_OWNER_EMAIL` (falls back to `SUPPORT_EMAIL`) with a link to the queue.
3. **Review** (`/admin/organization-requests`, linked from Platform Overview and SaaS Tenants). Platform `owner` and `support` can view; only `owner` can decide.
   - **Approve** requires ticking every checklist item (drawn from `docs/ORGANIZATION-REVIEW-GUIDE.md`). In one database transaction BandWagon creates the organization and its platform domain, seeds default settings (driver requirements, calendar settings, AI off), makes the requester an active `owner`, records the checklist on the request and writes audit events. The requester then gets an email with their tenant URL and a link to `/admin/setup`.
   - **Reject** requires a note. The note is emailed to the requester and shown on their `/start` page.
   - Requesters can withdraw a request while it is pending.
4. **Setup** (`/admin/setup`). New owners and admins see a checklist with live progress (x of y). Most items are detected from real data; a few can be marked done by hand:

| Item | Done when | Where |
| --- | --- | --- |
| Branding | `organizations.branding` has values, or marked done | Help Center (no self-serve editor yet) |
| Join code | an active join code exists (can be created on the setup page) | `/admin/setup#join-code` |
| Driver requirements | the requirements row was saved after creation, or marked done to keep defaults | `/admin/driver-requirements` |
| Organization policies | current Terms and Privacy versions accepted by an owner | `/admin/organization-policies` |
| Event or calendar | an event exists, or a Google/Microsoft calendar is connected | `/admin/events` |
| Co-admin | an invitation was sent, or 2+ owner/admin/manager members | `/admin/setup#invite` |
| Notification settings | marked done | `/admin/notifications` |
| Test ride | at least one ride exists | `/app/rides` |

Manual ticks live in `organization_setup_progress`.

## Admin invitations

- Owners can invite admins and managers. Admins can invite managers. Managers cannot invite. The platform owner can invite either role.
- The email contains a one-time link `/invite/<token>` valid for 7 days. The token is 32 random bytes; only its SHA-256 hash is stored.
- The invitee must sign in with the invited email (case-insensitive match against their verified emails). Accepting creates or upgrades the org-level membership and never lowers an existing role, so an owner stays an owner.
- Sending a new invite to the same email cancels the older open one. Invites can be canceled from the setup page.
- If email is not configured, the inviter sees the link once so they can share it directly. It still only works for the invited email.

## Limits and abuse controls

- Sign-in required for requests and invite acceptance.
- Cloudflare Turnstile (`organization_request` action) when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are set.
- At most 3 pending requests per person, plus Redis rate limits per IP and per person.
- One pending request per slug (database unique index).

## Data

Migration `055_org_onboarding.sql` adds `organization_requests`, `organization_invitations` and `organization_setup_progress`. Approved requests keep the agreement version, acceptance time and review checklist, and copy the request details into `organizations.settings.onboarding`.

## Environment

| Variable | Purpose |
| --- | --- |
| `PLATFORM_OWNER_EMAIL` | Where new-request alerts go (optional, falls back to `SUPPORT_EMAIL`) |
| `TENANT_BASE_DOMAIN` | Base domain for tenant addresses |
| `APP_URL` | Base URL used in emailed links |
| `SMTP2GO_API_KEY`, `EMAIL_FROM` | Email delivery |
