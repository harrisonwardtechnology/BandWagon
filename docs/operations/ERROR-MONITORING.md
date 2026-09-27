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

## GlitchTip

BandWagon also sends every error to a self-hosted [GlitchTip](https://glitchtip.com), which is Sentry-compatible. GlitchTip handles grouping, alerts, and history across deploys. The local `application_errors` table stays as the built-in fallback.

There's no Sentry SDK and no third-party script. BandWagon posts Sentry "envelopes" straight to GlitchTip from the server, using the same redaction as the local store.

### What gets sent

| Source | What | Tag `source` |
|---|---|---|
| Server | Every unhandled request error (the `onRequestError` hook). If `ERROR_MONITOR_INGEST_SECRET` isn't set, the error still goes to GlitchTip directly. | `server` |
| Browser | Uncaught errors and unhandled promise rejections on BandWagon pages. They go through `/api/client-errors`, never straight from the browser to GlitchTip. | `browser` |
| Worker | Background jobs that fail every retry and go "dead". | `worker` |
| Scheduled tasks | Any failed run (ride reminders, calendar sync, privacy maintenance, and so on). Tagged with `task`. | `scheduled-task` |
| Process | Unhandled promise rejections and uncaught exceptions. | `server` / `worker` |

Every event carries:

- `environment`: from `GLITCHTIP_ENVIRONMENT`, `NEXT_PUBLIC_ENVIRONMENT`, or `NODE_ENV`.
- `release`: from `GLITCHTIP_RELEASE` or Coolify's `SOURCE_COMMIT`. This lets GlitchTip show which deploy started a problem.
- `server_name`: `<APP_ROLE>@<container>`.

### What never gets sent

- No user IDs, names, emails, phone numbers, IP addresses, cookies, headers, or request bodies.
- Messages and stacks go through `redactApplicationErrorText`, which strips emails, phone-like numbers, six-digit codes, bearer tokens, database URLs, and sensitive query parameters.
- Route query strings are dropped entirely.
- Browser reports:
  - are accepted only from the same origin
  - are capped at 8 KB
  - are limited to 20 per IP every 10 minutes (Redis)
  - are limited to 5 per page load

  The browser always gets a 204, so reporting never shows up for users.

### Flood protection

Each process sends a given error at most once a minute, and at most `GLITCHTIP_MAX_EVENTS_PER_MINUTE` events (default 60) a minute overall. A bad deploy shows up as one loud issue, not thousands of requests. A send never waits more than 3 seconds and never throws.

### Setup on Coolify

1. **Deploy GlitchTip.** In Coolify: **+ New > Service > GlitchTip**. That's one-click, with its own Postgres and Redis. Give it a hostname like `glitchtip.bandwagon.club`, and add that hostname to the Cloudflare tunnel.
2. **Put it behind Cloudflare Access** for the web UI. Add a **bypass** policy for `/api/*` so BandWagon can post events. Keep `/_health/` reachable too; BandWagon's health page checks it.
3. **Create the project.** Create an organization "HWTech", then a project "BandWagon" with platform **Node.js**.
4. **Copy the DSN** from the project's Settings > Client Keys. Set it in Coolify on **every BandWagon role** (web and worker):
   ```
   GLITCHTIP_DSN=https://<key>@glitchtip.bandwagon.club/<project id>
   ```
   On staging, use a separate project, or the same project with `GLITCHTIP_ENVIRONMENT=staging`.
5. **Alerts.** In the project, open Alerts and add email to you, plus a webhook to wherever you want pings. Suggested rule: alert on every new issue, and when an issue gets more than 10 events in 5 minutes.
6. **Uptime.** GlitchTip can also watch URLs, but Uptime Kuma already does. Keep uptime in Kuma and use GlitchTip for errors.
7. **Check it.**
   - Admin > Health shows **GlitchTip Error Tracking** as healthy.
   - Trigger a test error; it appears in GlitchTip within seconds.
   - Browser errors show `source: browser`.
