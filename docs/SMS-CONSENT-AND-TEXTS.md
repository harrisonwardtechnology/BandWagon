# SMS Consent And Texts

How BandWagon collects consent for ride texts, sends them over RCS or SMS, and honors STOP, START, and HELP. See also [NOTIFICATION-ROUTING.md](NOTIFICATION-ROUTING.md) and [MESSAGING-ABUSE-CONTROLS.md](MESSAGING-ABUSE-CONTROLS.md).

## Where Opt-In Happens

- **Sign-in and sign-up** (`/login`): when the person chooses Mobile Phone, a separate consent checkbox appears. It is **unchecked by default**. The sign-in code is sent either way. Verifying a number is never consent by itself. Recorded with source `signup_checkbox`.
- **Notifications settings** (`/notifications`, "Text Messages"): a signed-in person with a verified phone can opt in or out. Recorded with source `settings`. Support View cannot change consent. API `/api/sms-consent`.
- **Public example** (`/sms-opt-in`): shows the consent experience for carrier review. Its checkbox is an unchecked example; the real opt-in is on `/login` or under Notifications.

## Consent Text

The exact wording shown next to every opt-in checkbox is `SMS_CONSENT_TEXT` in `apps/web/src/lib/sms-consent-policy.ts`. It is stored with each opt-in record along with `SMS_CONSENT_TEXT_VERSION` (currently `2026-09-26`). Change the version whenever the text changes.

## Sign-In Codes Are A Separate Consent

Carrier rule (Twilio ticket 29651215, 2026-09-30): asking for a sign-in code by text is its own consent, unbundled from ride texts.

- The button reads **Send Sign-In Code** (`OTP_SEND_BUTTON_LABEL`).
- When Mobile Phone is picked, this sits right under the button (`SMS_OTP_DISCLOSURE_TEXT`):

  > By clicking Send Sign-In Code, you agree to receive a one-time verification passcode via text message from BandWagon. Message and data rates may apply.

- The same screen shows **Don't Want A Text? Get Your Code By Email Instead** (and passkey sign-in when available), so texting is never required.
- The unchecked box is labeled **Optional: Ride Update Texts** and covers ride texts only. Its text says sign-in codes don't need it (`SMS_CONSENT_TEXT_VERSION` 2026-09-30).
- `/sms-opt-in` shows the same layout for carrier review.

## Welcome Text

`SMS_WELCOME_TEXT`, sent once, only when a web opt-in (checkbox or settings) turns a number from not opted in to opted in:

> BandWagon: You're signed up for ride texts (offers, confirmations, reminders, pickup updates). Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to opt out. Support: support@bandwagon.club

- Saving settings again while already opted in does not resend it.
- A carrier START reply does not send it; Twilio sends the START reply.
- Sending is best effort and never blocks sign-in or settings.

## HELP Text

`SMS_HELP_TEXT`:

> BandWagon ride texts: help at https://bandwagon.club/help or support@bandwagon.club. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out.

The app does not send this itself. It is pasted into Twilio Advanced Opt-Out (below).

## STOP And START

- Inbound texts hit `/api/webhooks/twilio/inbound`, which requires a valid Twilio signature.
- Twilio's `OptOutType` wins when present. Without it, the keyword itself is used: STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, REVOKE, OPTOUT opt out; START, YES, UNSTOP opt in.
- Consent is recorded before the duplicate check. If recording fails the webhook returns 500 so Twilio retries.
- Each change writes:
  - `sms_opt_outs`: the number-level registry, keyed by phone lookup hash, `state` of `opted_in` or `opted_out`.
  - `phones.messaging_consent_status` on every matching phone row.
  - `sms_consent_events`: history with action, source (`signup_checkbox`, `settings`, `carrier_keyword`, `twilio_advanced_opt_out`), and the consent text for web opt-ins.
- Consent is also mirrored to Redis. Tables come from migration `053_sms_consent_records.sql`.

## When A Text May Be Sent

- Ride texts need an affirmative opt-in on the verified phone and no newer carrier STOP for the number.
- **Verification codes (`otp`)** the person just asked for do not need ride-text consent, but are **blocked after a carrier STOP** like everything else.
- The check fails closed: if the number cannot be hashed, nothing is sent.

## Rate Limits

Enforced in `apps/web/src/lib/twilio-send.ts` before Twilio is called, under a per-number lock:

- Verification codes: 5 per recipient per 15 minutes.
- All other texts: 20 per recipient per hour.
- A per-organization monthly texting cap also applies. Critical and OTP messages are always allowed but still counted.
- Message bodies are limited to 600 characters and to an allowlist of transactional types.

## RCS With SMS Fallback

Every message is sent with one Twilio Messaging Service (`TWILIO_MESSAGING_SERVICE_SID`). The service uses the RCS sender where the handset supports it and falls back to SMS otherwise. Only a forced SMS send (`mode: "sms"`) also sets `From` to `TWILIO_PHONE_NUMBER`. Staging and test environments only reach allowlisted phones.

## Twilio Console Setup

In the Messaging Service, under Advanced Opt-Out:

- **HELP reply**: paste `SMS_HELP_TEXT` exactly.
- **START reply**: "BandWagon: You're re-subscribed to ride texts. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to opt out."
- Keep STOP handled by Advanced Opt-Out so `OptOutType` reaches the webhook.
- Point the inbound webhook to `/api/webhooks/twilio/inbound` and status callbacks to `/api/webhooks/twilio/status`.

## RCS Sender Profile

| Item | Value |
| --- | --- |
| Sender id | `rcs:bandwagon_51yrkdi9_agent` |
| Logo (224x224) | https://bandwagon.club/brand/rcs-logo-224.png |
| Banner (1440x448) | https://bandwagon.club/brand/rcs-banner-1440x448.png |
| Contact | support@bandwagon.club |
| Website | https://bandwagon.club |
| Privacy | https://bandwagon.club/privacy |
| Terms | https://bandwagon.club/terms |

Twilio onboarding ticket 29651215 was in review as of 2026-09-29.

## Code And Tests

- Rules and texts: `apps/web/src/lib/sms-consent-policy.ts`
- Recording and welcome text: `apps/web/src/lib/sms-consent.ts`
- Sending: `apps/web/src/lib/twilio-send.ts`
- Tests: `apps/web/tests/sms-consent-policy.test.ts`, `apps/web/tests/twilio-security.test.ts`
