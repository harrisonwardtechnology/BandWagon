# Application Error Monitoring

Next.js unhandled request errors are captured through the server instrumentation hook and stored in `application_errors`.

Configure `ERROR_MONITOR_INGEST_SECRET` with a unique random value of at least 32 characters. The instrumentation hook sends a redacted envelope to the Node-only internal ingestion route at `APP_URL`; the route rejects reports without the bearer secret.

- Error fingerprints group repeated failures by error name, redacted message, and route.
- Email addresses, phone-like values, OTP-like six-digit codes, bearer tokens, database URLs, and sensitive query parameters are removed before storage.
- Request bodies and headers are never stored.
- Resolved fingerprints reopen automatically if the same failure recurs.
- Platform Health shows open fingerprints and occurrence counts from the previous 24 hours.
- Platform owners and support operators can resolve an investigated fingerprint; the action is audited.

This first-party store is the production baseline. If an external observability vendor is added later, send only the same redacted envelope and disable request-body, session-replay, and sensitive-header collection.
