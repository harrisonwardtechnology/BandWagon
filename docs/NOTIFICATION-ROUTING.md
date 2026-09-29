# BandWagon Notification Routing

BandWagon uses a push-first notification strategy to reduce SMS/RCS cost while preserving reliable delivery for time-sensitive ride events.

SMS/RCS consent, STOP/HELP handling, and Twilio setup: [SMS-CONSENT-AND-TEXTS.md](SMS-CONSENT-AND-TEXTS.md).

## Routing Model

Straight from `POLICIES` in `apps/web/src/lib/notification-router.ts`:

| Event | Urgency | Push | Email | SMS/RCS |
|---|---|---|---|---|
| `new_ride_available` | Routine | Yes | If push unavailable | No |
| `driver_offer` | Routine | Yes | If push unavailable | No |
| `ride_matched` | Important | Yes | If push unavailable | Fallback, if preferences allow |
| `reminder_24h` | Routine | Yes | If push unavailable | No |
| `reminder_1h` | Important | Yes | No | Fallback, if reminder SMS is on |
| `driver_arriving` | Critical | Yes | No | Immediately |
| `last_minute_cancellation` | Critical | Yes | If push unavailable | Immediately |
| `pickup_changed` | Critical | Yes | No | Immediately |
| `safety_alert` | Critical | Yes | If push unavailable | Immediately |
| `credential_expiring` | Important | Yes | If push unavailable | No |
| `organization_removed` | Important | Yes | Always | No |
| `organization_decommission_confirmation` | Critical | Yes | Always | Immediately |
| `waitlist_offer` | Important | Yes | If push unavailable | Fallback |
| `waitlist_update` | Routine | Yes | If push unavailable | No |
| `event_proposal_submitted` | Routine | Yes | If push unavailable | No |
| `event_proposal_decision` | Routine | Yes | If push unavailable | No |
| `otp` (sign-in code) | Critical | No | No | Only channel |
| `platform_test` | Important | Yes | No | Fallback |

Any type not listed falls back to routine: push, then email.

The one-time `sms_welcome` text is sent straight through Twilio (not the router) right after someone newly opts in.

## User preferences

Routing respects `notification_preferences`:

- `push_enabled`
- `email_enabled`
- `sms_enabled`
- `sms_for_critical_only`
- reminder-specific push/email/SMS settings

Defaults deliberately favor push and limit SMS/RCS.

## Delivery logging

Every channel writes to `notification_deliveries` with:

- notification type
- channel
- status
- provider message ID when available
- estimated channel cost
- urgency
- correlation ID

The correlation ID ties push/email/SMS attempts for the same logical notification together and will feed the future cost/savings dashboard.

## Email

Email routing supports SMTP2GO's API when these runtime variables are configured:

- `SMTP2GO_API_KEY`
- `EMAIL_FROM` (or existing `SUPPORT_EMAIL` as fallback)

If they are not configured, email fallback is skipped safely; push and SMS/RCS continue normally.

## Admin test console

After migration `005_notification_routing.sql` is applied:

`/admin/notifications`

Sign in with a platform administrator account to load routing policies. Sending a test notification requires a platform owner.

If `ADMIN_TEST_PHONE` is configured, SMS/RCS tests are restricted to that number.

## Phone Numbers

The router looks up the person's verified phone (`getVerifiedPhone` in `notification-router.ts`) when `personId` is given. An explicit E.164 `phone` still works for tests and OTP.
