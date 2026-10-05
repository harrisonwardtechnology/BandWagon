# BandWagon Notification Routing

BandWagon uses a push-first notification strategy to reduce SMS/RCS cost while preserving reliable delivery for time-sensitive ride events.

SMS/RCS consent, STOP/HELP handling, and Twilio setup: [SMS-CONSENT-AND-TEXTS.md](SMS-CONSENT-AND-TEXTS.md).

## Routing Model

Straight from `POLICIES` in `apps/web/src/lib/notification-router.ts`:

| Event | Urgency | Push | Email | SMS/RCS |
|---|---|---|---|---|
| `new_ride_available` | Routine | Yes | If push unavailable | No |
| `driver_offer` | Routine | Yes | If push unavailable | No |
| `ride_matched` | Important | Yes | If push unavailable | Fallback, only if the person turned off "SMS for critical only" |
| `reminder_24h` | Routine | Yes | If push unavailable | No |
| `reminder_1h` | Important | Yes | No | Fallback, if reminder SMS is on |
| `driver_arriving` | Critical | Yes | No | Immediately |
| `last_minute_cancellation` | Critical | Yes | Always | Immediately |
| `pickup_changed` | Critical | Yes | No | Immediately |
| `safety_alert` | Critical | Yes | Always | Immediately |
| `credential_expiring` | Important | Yes | If push unavailable | No |
| `organization_removed` | Important | Yes | Always | No |
| `organization_decommission_confirmation` | Critical | Yes | Always | Immediately |
| `waitlist_offer` | Important | Yes | If push unavailable | Fallback, only if the person turned off "SMS for critical only" |
| `waitlist_update` | Routine | Yes | If push unavailable | No |
| `event_proposal_submitted` | Routine | Yes | If push unavailable | No |
| `event_proposal_decision` | Routine | Yes | If push unavailable | No |
| `household_delegate_activity` | Important | Yes | If push unavailable | No |
| `household_delegate_invitation` | Important | No | Always | No |
| `otp` (sign-in code) | Critical | No | No | Only channel |
| `platform_test` | Important | Yes | No | Fallback (the admin test forces critical urgency, so it is sent when no push arrives) |

Any type not listed falls back to routine: push, then email. A test (`apps/web/tests/notification-routing-policy.test.ts`) fails when this table and `POLICIES` disagree.

How to read the columns:

- **Email "If push unavailable"**: sent only when no push reached a device. **"Always"**: sent as well as push. Every critical type that has an email fallback is always emailed.
- **SMS/RCS "Immediately"**: sent right away, alongside push, to anyone who agreed to texts. Critical types skip the "SMS for critical only" preference.
- **SMS/RCS "Fallback"**: sent only when no push reached a device, and only for people who turned off "SMS for critical only" (it is on by default). So by default these go out as push, or email when push is not available.
- Household delegate (trusted adult) notices and event proposal notices are never texted. Delegate invitations are sent by email straight from `household-delegates.ts`; the policy row keeps them email-only if they are ever routed.

## Brand Prefix On Texts

Every SMS/RCS body starts with the brand: `BandWagon: Your driver is on the way.` The prefix is added in one place, `enforceMobileMessageIntent` in `apps/web/src/lib/messaging-policy.ts` (`withSmsBrandPrefix`), which every text passes through. A body that already starts with "BandWagon" (sign-in codes, the welcome text, the platform test) is left alone, so nothing is prefixed twice. Push and email keep the body as written.

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
- channel (for texts: the channel Twilio really used, once its status callback arrives; see below)
- status
- provider message ID when available
- estimated channel cost
- urgency
- correlation ID

The correlation ID ties push/email/SMS attempts for the same logical notification together and will feed the future cost/savings dashboard.

### Real Channel For Texts

"Auto" sends go through the Twilio Messaging Service, which tries RCS and falls back to SMS. The send path cannot know which one Twilio picks, so the row starts as `rcs`. When Twilio's status callback (`/api/webhooks/twilio/status`) arrives, `recordDeliveredChannelFromStatus` (`apps/web/src/lib/twilio-status.ts`) sets `channel` to what was really used and keeps both in `metadata` (`requestedChannel`, `deliveredChannel`). The channel is read from the callback's `ChannelPrefix`, or from `From` (`rcs:...` means RCS; a phone number, short code, or alphanumeric sender means SMS). If the callback does not say, the row is left as it was. Until a callback arrives the row still shows the requested channel.

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

The router looks up the person's verified phone (`getVerifiedPhone` in `accounts.ts`) when `personId` is given. When a person has more than one verified phone, every lookup (the router, the send path's consent check, and the settings page) uses the same order, `verifiedPhoneOrderBy` in `sms-consent-policy.ts`: newest verification first. An explicit E.164 `phone` still works for tests and OTP.
