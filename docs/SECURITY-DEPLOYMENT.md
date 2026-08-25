# Security & Deployment Rules

## Public Repository Rules

- Commit `.env.example`, never `.env`.
- Enable GitHub secret scanning and push protection.
- Run dependency scanning, SAST, and secret scanning in CI.
- Protect the default branch and require pull-request review for production changes.
- Pin or regularly update container images and dependencies.
- Publish `SECURITY.md` with a private vulnerability-reporting contact.

## Production Startup Must Fail Closed

Refuse to start when:

- `APP_URL` is not HTTPS.
- `AUTH_SECRET` or `DATA_ENCRYPTION_KEY` is missing/weak.
- database configuration is missing.
- a required enabled feature lacks its required credentials.
- known placeholder values such as `changeme` are detected.

Optional integrations may disable themselves only when the corresponding feature flag is false.

## Never Log

- OTP values
- magic-link/action tokens
- exact home addresses
- full phone numbers unless essential to a protected audit event
- full email addresses unless essential to a protected audit event
- OAuth access/refresh tokens
- Twilio auth credentials
- message bodies by default

## Environment Separation

Development/demo environments must not share production OAuth, SMTP, Twilio, database, encryption, or signing secrets.

BandWagon treats SMS/RCS as a closed transactional channel rather than user chat or a general-purpose relay. The enforced boundaries and operational checks are documented in [`MESSAGING-ABUSE-CONTROLS.md`](MESSAGING-ABUSE-CONTROLS.md).
