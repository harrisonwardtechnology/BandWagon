# SMS And RCS

How BandWagon sends ride texts, how consent works, and how Twilio is set up.

Code:

- `apps/web/src/lib/sms-consent-policy.ts`: consent wording, welcome and HELP text, keyword rules, send decision
- `apps/web/src/lib/sms-consent.ts`: records opt-in and opt-out, sends the welcome text
- `apps/web/src/lib/twilio-send.ts`: every outbound text goes through here
- `apps/web/src/lib/messaging-policy.ts`: which message types may be texted
- `apps/web/src/app/api/webhooks/twilio/inbound/route.ts`: inbound STOP, START, and other replies
- `apps/web/src/app/api/sms-consent/route.ts`: opt-in and opt-out from settings
- `apps/web/src/app/sms-opt-in/page.tsx`: public opt-in example page

## Consent Rules

- Texts are optional. An account works with a verified email alone.
- The opt-in checkbox is **unchecked by default**.
- **Verifying a phone number is not consent.** A new phone is saved as `not_configured`. Only the separate checkbox opts someone in.
- The exact consent text and its version (`SMS_CONSENT_TEXT`, `SMS_CONSENT_TEXT_VERSION`) are stored with every web opt-in in `sms_consent_events`. Change the version whenever the wording changes.
- Consent can only be changed by the account owner. Support mode cannot change it.

Consent text shown next to every checkbox:

> I agree to receive transactional SMS messages from BandWagon, a Harrison Ward Technology product, about ride requests, ride offers, confirmations, schedule changes, reminders, account activity, pickup/drop-off status, cancellations, and ride coordination. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help.

## Where Opt-In Happens

- **`/login`, Mobile Phone tab**: checkbox under the number field. Links to Terms, Privacy, and `/sms-opt-in`. The sign-in code is sent either way. Consent is recorded only after the code is verified (source `signup_checkbox`).
- **Notifications settings**: turn texts on or off for the newest verified phone (source `settings`).
- **Public `/sms-opt-in` page**: shows the exact checkbox and wording for carriers and Twilio reviewers. It links to Terms of Use, Privacy Policy, and Messaging. Its button sends people to `/login` to actually opt in.

## Welcome Text

Sent once, only when a web opt-in is new. Not sent again if the person was already opted in. Sending is best effort and never blocks sign-in.

> BandWagon: You're signed up for ride texts (offers, confirmations, reminders, pickup updates). Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to opt out. Support: support@bandwagon.club

## HELP Text

Twilio Advanced Opt-Out sends this. The app does not reply to HELP itself.

> BandWagon ride texts: help at https://bandwagon.club/help or support@bandwagon.club. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out.

## STOP And START

- Twilio handles the reply to STOP, START, and HELP.
- The inbound webhook records the change in the database.
- It reads Twilio's `OptOutType`. If that is missing, it falls back to the keyword itself, so a STOP is never lost if a console setting changes.
- Opt-out words: STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, REVOKE, OPTOUT.
- Opt-in words: START, YES, UNSTOP.
- Matching is whole message, any case.
- Consent is saved before the duplicate check. If saving fails, the webhook returns 500 so Twilio retries.
- The inbound webhook checks the Twilio signature and never logs message text.

### The `sms_opt_outs` Registry

- One row per phone number (stored as a lookup hash, not the number).
- Holds the latest state (`opted_in` or `opted_out`) and where it came from.
- It covers numbers that are not tied to any account, so a STOP from anyone is honored.
- STOP also sets every matching phone row to `opted_out`.
- START restores the verified phone rows to `opted_in`.
- The state is also mirrored to Redis.

## Send Checks

Every text goes through `sendTwilioNotification`. Checks, in order:

1. The number must be valid E.164.
2. The message type must be on the approved list in `messaging-policy.ts`. Most types must be tied to a BandWagon person.
3. The body must be 1 to 600 characters. Control characters are stripped.
4. In staging and test, only allowlisted phones reach Twilio. Others are logged as skipped.
5. `platform_test` texts in production only go to `ADMIN_TEST_PHONE`.
6. **Consent check (fails closed).** If the number cannot be hashed, or the database is missing in production, nothing is sent.
7. Per-recipient rate limit.
8. Per-organization monthly texting cap.

### Consent Decision

- Opted out in the registry or on the phone row: **blocked**, for every type.
- Verification codes (`otp`): allowed without ride-text consent, because the person just asked for the code. **Blocked after STOP.**
- Everything else: needs `opted_in` on the verified phone.

### Rate Limits

| Limit | Value |
| --- | --- |
| Texts to one number, when sending a code | 5 per 15 minutes |
| Texts to one number, all other types | 20 per hour |
| Code requests per email or phone | 5 per 15 minutes |
| Code requests per IP address | 20 per 15 minutes |
| Organization monthly cap | Per organization. Critical alerts and codes always go through but still count. |

The per-number limit counts all SMS and RCS sent to that number in the window.

When an organization hits its cap, the text is paused and email is used instead if the person allows email.

## One Messaging Service: RCS First, SMS Fallback

- All texts use one Twilio Messaging Service (`TWILIO_MESSAGING_SERVICE_SID`).
- The RCS sender and the SMS number are both in that service.
- Twilio sends RCS when the phone supports it and falls back to SMS otherwise.
- This includes sign-in codes. When Twilio asked whether codes go over RCS or SMS, the answer was **both**.
- Code can force SMS only (`mode: "sms"`, needs `TWILIO_PHONE_NUMBER`). Nothing in the app does that today.
- The delivery log records the requested mode, not the channel Twilio actually used. Use the Twilio console to see the real channel.

Environment variables (values live in Coolify only): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, `TWILIO_PHONE_NUMBER`, `ADMIN_TEST_PHONE`, `APP_URL`.

Webhooks:

- Inbound: `https://bandwagon.club/api/webhooks/twilio/inbound`
- Status callback: `https://bandwagon.club/api/webhooks/twilio/status` (set automatically on each send from `APP_URL`)

## Twilio Console Setup

Messaging Service > Opt-Out Management (Advanced Opt-Out):

- **HELP reply**: paste `SMS_HELP_TEXT` exactly (see above).
- **START reply**:

  > BandWagon: You're re-subscribed to ride texts. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to opt out.

- **STOP reply**: Twilio default unless changed. Keep "BandWagon" in it.
- Keep the default keyword lists. The app matches the same words.

If `SMS_HELP_TEXT` changes in code, paste the new text into Twilio too.

## RCS Sender

- Agent id: `rcs:bandwagon_51yrkdi9_agent`
- Status: in review. Twilio support request #29651215.

Profile fields:

| Field | Value |
| --- | --- |
| Logo | https://bandwagon.club/brand/rcs-logo-224.png |
| Banner | https://bandwagon.club/brand/rcs-banner-1440x448.png |
| Email | support@bandwagon.club |
| Website | https://bandwagon.club |
| Privacy | https://bandwagon.club/privacy |
| Terms | https://bandwagon.club/terms |

Image limits:

- Logo: 224x224, 50 KB max.
- Banner: 1440x448, 200 KB max.
- The banner only shows on Android.

Changing the logo or banner after approval needs another review. See [BRANDING.md](../BRANDING.md).

## Sample Messages

Samples for Twilio and carrier review. Names are fictional. Live wording comes from the code and may differ slightly.

| Use Case | Sample |
| --- | --- |
| Ride offer | BandWagon: Dana Reyes offered Sam a ride to Friday's Band Rehearsal, pickup 5:40 PM. Open BandWagon to accept. Reply STOP to opt out. |
| Confirmation | BandWagon: Your ride is confirmed. Dana Reyes will drive Sam to Band Rehearsal Friday at 5:40 PM. |
| Reminder | BandWagon reminder: Sam's ride to Band Rehearsal is in 1 hour. Driver: Dana Reyes. |
| Pickup update | BandWagon: Your driver Dana Reyes is on the way. |
| Schedule change | BandWagon: Pickup for Saturday's Marching Contest moved to 6:15 AM. Open BandWagon for details. |
| Cancellation | BandWagon: Your ride to Band Rehearsal was cancelled. Your request was reopened so another driver can help. |
| Waitlist offer | BandWagon: A seat opened in Jordan Lee's carpool to the Fall Concert. You have 30 minutes to accept. Open BandWagon to accept or pass. |
| Verification code | BandWagon verification code: 482913. Expires in 10 minutes. |
