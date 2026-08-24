# BandWagon Notification Routing

BandWagon uses a push-first notification strategy to reduce SMS/RCS cost while preserving reliable delivery for time-sensitive ride events.

## Routing model

| Event | Urgency | Primary | Fallback / additional channel |
|---|---|---|---|
| New ride available | Routine | Push | Email if push unavailable |
| Driver offer | Routine | Push | Email if push unavailable |
| Ride matched | Important | Push | SMS/RCS if push unavailable and user preferences allow it |
| 24-hour reminder | Routine | Push | Email if reminder email is enabled |
| 1-hour reminder | Important | Push | SMS/RCS fallback if reminder SMS is enabled |
| Driver arriving | Critical | Push | SMS/RCS immediately |
| Last-minute cancellation | Critical | Push | SMS/RCS immediately + email when available |
| Pickup/location changed | Critical | Push | SMS/RCS immediately |
| OTP / phone verification | Critical | SMS/RCS | No push |

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

## Current limitation

Phone numbers are not resolved from `phones.e164_ciphertext` yet because the account/household encryption workflow is not complete. The router accepts an explicit E.164 phone number today. The upcoming Accounts/Households milestone will resolve the user's verified phone internally before calling the router.
