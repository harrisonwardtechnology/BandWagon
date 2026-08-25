# Messaging Abuse Controls

BandWagon mobile messaging is a transactional notification channel, not a chat, broadcast-marketing, or general-purpose relay service.

## Enforced Boundaries

- Inbound Twilio webhooks require a valid Twilio signature and reject oversized payloads.
- Duplicate webhook events are discarded.
- Arbitrary inbound message bodies are neither echoed nor logged.
- Twilio Advanced Opt-Out owns carrier-facing STOP, START, and HELP responses; BandWagon mirrors consent into Redis and PostgreSQL.
- The only additional inbound command is the short-lived organization-decommission confirmation. It requires a pending request, an expiring one-time code, and a matching verified phone.
- Outbound SMS/RCS is limited to an explicit allowlist of BandWagon transactional workflow types.
- Normal transactional messages must be bound to a BandWagon person. OTP and the platform-owner test are the only pre-account/test exceptions.
- Production test messages can only target `ADMIN_TEST_PHONE` and use a fixed server-controlled template.
- Control characters are removed and mobile message bodies are capped at 600 characters.
- Per-recipient rate caps apply before Twilio is called: five OTP messages per 15 minutes and twenty other mobile messages per hour. The authentication service also applies identifier and source-IP OTP throttles.
- Verified phones marked opted out are excluded from notification routing, and Twilio remains the final carrier-level enforcement layer.
- Delivery attempts, type, status, estimated cost, recipient binding, and correlation identifiers are recorded for operational review without logging message bodies.

## Deliberately Unsupported

- user-to-user chat or replies;
- arbitrary recipient entry by organization members;
- organization-created free-form SMS/RCS broadcasts;
- forwarding an inbound message to another user;
- marketing or sponsor messages through the transactional channel;
- user-controlled sender identities or Twilio templates.

Any future conversational feature requires a separate threat model, abuse/reporting controls, moderation and retention policy, consent model, carrier use-case review, and organization-level enablement. It must not reuse the v1 transactional path by default.

