# Organization Fair Use, Impact Reports, and Sponsors

BandWagon is free to organizations and families. Revenue is optional community support and local sponsors. This note explains the per-organization texting allowance, how impact numbers are estimated, and the rules for sponsors.

Migration: `apps/web/database/migrations/056_org_caps_impact_sponsors.sql`.

## 1. Texting fair use (per organization)

Texts (SMS/RCS) cost real money per segment, so each organization has a monthly texting allowance. Push notifications and email are not limited.

| Setting | Where | Default |
| --- | --- | --- |
| Platform default allowance | env `ORG_DEFAULT_MONTHLY_SMS_CAP_CENTS` | `2500` ($25.00 per month) |
| Per-organization override | `organization_messaging_limits.monthly_cost_cap_cents` (NULL = platform default) | NULL |
| Early alert threshold | `organization_messaging_limits.alert_threshold_percent` | 80 |

**Enforcement** happens in `reserveMobileDelivery` (`src/lib/twilio-send.ts`), in the same transaction that reserves the `notification_deliveries` row:

1. Per-recipient advisory lock (existing), then a per-organization advisory lock `bandwagon:org-mobile:<orgId>`. The lock order is fixed, so there is no deadlock.
2. Sum this UTC calendar month's `estimated_cost_cents` for the organization's `sms`/`rcs` rows (excluding `failed` and `blocked_org_cap`).
3. Decide with `decideOrgMobileCap` (`src/lib/org-messaging-cap-policy.ts`):
   - Within the allowance: allowed.
   - Over the allowance: `routine` and `important` are blocked with `Organization monthly texting limit reached`.
   - `critical` urgency (safety alerts, driver arriving, pickup changes, cancellations) and `otp` are **always allowed** and still counted.
   - Messages with no `organization_id` (platform tests, sign-in codes before an organization is known) are not org-capped. The platform budget and per-recipient limits still apply.
4. A blocked send is recorded as a `notification_deliveries` row with `status='blocked_org_cap'`, cost 0, and no destination, so admins can see how many texts were paused without affecting per-recipient rate limits.

**Router fallback.** `routeNotification` already sends push first and catches SMS errors. When the org limit pauses a text and push did not reach the person, the router now also sends email (if the person allows email), even for types whose policy has no email fallback, so nobody is silently missed.

**Alerts.** After each reservation (or block), `evaluateOrgMessagingAlerts` emails organization owners/admins and platform owners (verified emails) once per organization, month, and threshold (alert percent and 100%). The unique key on `organization_messaging_alerts(organization_id, usage_month, threshold_percent)` is the dedupe guard. Failed sends are retried at most once an hour. Alerts are also written to `audit_events`.

**Screens.**
- `/admin/usage`: organization admins see texting usage against the allowance (read-only) and this month's AI usage, read from the existing AI governance data (`organization_ai_settings`, `ai_jobs`). AI caps stay on `/admin/ai-settings`; they are not duplicated here.
- Platform owner sees every organization's usage on the same page and can set or reset an organization's allowance (`POST /api/admin/usage`, action `set-limit`). Changes are audited (`org_texting_limit_updated`). Linked from `/admin/tenants`.

## 2. Impact report

`/admin/impact` (organization chooser when an admin has several) shows This month, This school year (August 1 to July 31), and All time. CSV export: `GET /api/admin/impact?organizationId=...&format=csv`.

Formulas live in `src/lib/impact-policy.ts` and are intentionally conservative:

- **Completed rides**: rides with `status='completed'`.
- **Riders served**: distinct passengers on completed rides who were not no-shows.
- **Seats shared**: seats on completed rides given to families other than the driver's household.
- **Car trips avoided**: one per ride request served on a completed ride where the requesting family is not the driver's own household. Siblings on one request count once; a round trip counts once.
- **Vehicle miles avoided** = trips avoided x miles per trip. BandWagon does not store per-ride route distance (exact locations are private and encrypted), so the default is **5 miles per trip**. Admins can adjust it from 0.5 to 50. Driver detours are not subtracted separately; the low default absorbs them.
- **Driving hours saved** = trips avoided x minutes per trip (default **15**).
- **CO2 avoided** = miles x **400 g per mile** (U.S. EPA, "Greenhouse Gas Emissions from a Typical Passenger Vehicle").
- **Active drivers**: distinct drivers of completed rides. **Families participating**: distinct households of riders' requesters and drivers.

**Small-number privacy.** Counts from 1 to 4 display as "fewer than 5". Miles, hours, and CO2 based on a suppressed trip count are not shown. Exact small counts never leave the server (the API returns display strings only).

**Public impact page** `/impact/<slug>`: off by default (`organization_impact_settings.public_impact_enabled`). When an admin turns it on, it shows school year and all time totals (same suppression), the formulas, and the organization's active public sponsors. No names, rides, schedules, or locations. Not indexed by search engines.

## 3. Sponsors

`/admin/sponsors` lets organization admins add, edit, and end sponsors in `organization_sponsors`: name (120 chars), website and logo URL (https only, 500 chars, no credentials, no `javascript:`/`data:`), recognition level (Gold, Silver, Bronze, Community, or custom up to 40 chars), start/end dates, a public display toggle, and admin-only internal notes (2,000 chars). Every change is audited. The database also enforces the length and https checks for new rows (`NOT VALID` constraints, so older rows are not rejected; public output re-validates URLs).

The page also lists sponsorship payments made through Stripe for that organization (`support_contributions`, `contribution_type='sponsor'`). The payer email is never returned, and anonymous payments show as "Anonymous". Sponsor names and websites that arrive through Stripe Checkout metadata are trimmed and re-validated as https before any public sponsor record is created.

`/admin/sponsors/packet` is a printable page (Print or Save as PDF) with the organization's impact numbers, recognition options, and the promise to families, for pitching local businesses.

### Core Funding Boundary (non-negotiable)

Per `docs/ORGANIZATION-REVIEW-GUIDE.md`:

- Sponsors receive adult-facing recognition only (public impact page, newsletters, meetings).
- Sponsors never receive participant data: no names, contact details, ride history, schedules, or locations.
- Sponsors never get matching priority.
- Sponsors never get targeted advertising or messages to families or students.

The sponsor tables have no links to riders, drivers, rides, or locations, and the sponsor code paths do not read them.
