# BandWagon Changelog

## v1.0.0-rc1 - Unreleased

### September 2026: Launch Polish

- **New features (#37):** feature request form at `/help/ideas` with voting and an admin queue ([docs](docs/FEATURE-REQUESTS.md)); ride waitlists with timed seat offers ([docs](docs/WAITLISTS.md)); member event proposals that organizers approve ([docs](docs/EVENT-PROPOSALS.md)); trusted household members who can help a family with rides ([docs](docs/HOUSEHOLD-DELEGATES.md)); passkey sign-in ([docs](docs/PASSKEYS.md)); SEO with sitemap, robots rules and structured data ([docs](docs/operations/SEO.md)). Migrations 057 to 062.
- **SMS (#45):** one welcome text after a new opt-in (brand, frequency, rates, HELP/STOP, support contact). Terms and Privacy links at every opt-in. The public `/sms-opt-in` page has a working sign-up button. See [SMS And RCS](docs/operations/SMS-AND-RCS.md).
- **New logo (#46, #47, #49):** the Route To The Show mark replaces the old "Bw" letters on the site, app icons, share card, Stripe, BIMI, the Google sign-in screen, the RCS sender and the demo. See [Branding](docs/BRANDING.md).
- **Demo (#39, #47, #48):** moved to `demo.bandwagon.club`, fixed the phone layout, BandWagon naming, long-lived caching with automatic content-hash cache busting, and a service worker. See [Demo Site](docs/operations/DEMO-SITE.md).
- **Email (#35, #36):** contact addresses moved to `@bandwagon.club`, `security.txt` added, BIMI logo. Mail now flows through Proofpoint to Microsoft 365 with MTA-STS, TLS-RPT and DMARC reject. See [Email](docs/operations/EMAIL-DOMAIN.md).
- **Title Case (#42, #43, #44):** short UI text and page titles use Title Case, guarded by `tests/title-case-ui.test.ts`.
- **Headers (#44):** HSTS on every response, and icons and brand files cache for a week.
- **Other fixes:** custom hostname certificates pinned to Google's CA (#38), last `harrisonward.*` crumbs removed from docs (#40), status page link in the header and footer (#41), Google reconnect prompt (#34).
- **Docs:** full refresh with a [docs index](docs/README.md), new runbooks for SMS/RCS, Google OAuth verification and the demo site, and a [known issues](docs/KNOWN-ISSUES.md) list.

### Earlier In rc1

- GlitchTip error tracking (Sentry-compatible, self-hosted): server request errors, browser errors (via same-origin `/api/client-errors`), dead worker jobs, failed scheduled tasks, and unhandled process errors are sent as redacted Sentry envelopes when `GLITCHTIP_DSN` is set. No SDK, no third-party browser script, per-process flood guard, 3 s timeout. Platform Health shows GlitchTip status and has a "Send GlitchTip test event" button. Setup: `docs/operations/ERROR-MONITORING.md`.

- Domain: BandWagon moves to `bandwagon.club` (product site) and `<slug>.bandwagon.club` (communities). Old `bandwagon.harrisonward.net` and `<slug>.harrisonward.org` page visits redirect (308); API calls and webhooks on old hosts keep working, and Twilio signatures validate for both. `npm run tenants:move-domain` moves existing communities. Runbook: `docs/operations/MOVE-TO-BANDWAGON-CLUB.md`.
- HA compose web router now matches every hostname at the lowest priority, so tenant subdomains and custom domains reach the app.

- High availability: one image now runs as `APP_ROLE=web`, `worker`, or `all` (default, unchanged behavior). New `docker-compose.coolify.ha.yml` runs a one-shot migrate, two load-balanced web containers, and two workers. See `docs/operations/HIGH-AVAILABILITY.md`.
- Durable job queue (`background_jobs`): SKIP LOCKED claims, renewable leases (crashed workers' jobs are retaken in ~90s), backoff retries, dead-lettering, and dedupe keys.
- Built-in scheduler replaces external cron timers; each task fires once per interval across all workers and runs under an advisory lock (also applied to `/api/cron/*`).
- `NOTIFICATION_DELIVERY=queue` moves ride notifications off the request path.
- Race-safe migrations (advisory lock), Stripe event-id dedupe, DoDomain insert-on-conflict dedupe, and worker/queue/Redis rows in `/api/health/deep`.

- SMS consent: verifying a phone number no longer opts a person in to ride texts. A separate, unchecked-by-default checkbox (signup and Notifications settings) records affirmative consent with the exact text shown.
- SMS opt-outs: STOP/START are recorded in Postgres in a number-level registry (`sms_opt_outs`) that also covers numbers not yet on an account. Keyword fallback works even without Twilio Advanced Opt-Out, and a failed write returns 500 so Twilio retries.
- The send path checks consent even when `LOOKUP_HASH_KEY` is unset (fails closed).

- Completed the v1 ride, household, managed-student, driver, safety, pickup-verification, calendar, privacy, tenant, and operations contract.
- Added organizer-created manual events; ordinary member publishing remains disabled for v1.
- Added production readiness profiles that keep Twilio and Google as explicit FloMoGo launch gates.
- Added privacy-safe error monitoring, staged key rotation, backup/restore verification, PWA/accessibility safeguards, and a repeatable load smoke.
- Added fail-closed AI governance with organization opt-in, budgets, bounds, timeouts, and audited manual fallback.
- Added an authoritative v1 launch checklist and release-candidate notes; general availability remains blocked on the recorded production and human-verification gates.

## v0.8 - Current consolidation
- Consolidated deployed production scaffold and all incremental update packs.
- Added public Privacy, Terms, Messaging and SMS Opt-In pages.
- Added Twilio messaging, delivery status, voice and voice-status webhooks.
- Added Twilio signature validation and Redis idempotency.
- Improved voice greeting pacing and neural voice configuration.
- Added protected platform Messaging Test console.
- Consolidated environment-variable example.
- Documented non-sequential `/r/{8-char}` public ride URL convention.
- Added GitHub social-preview artwork to docs assets.

## Earlier build increments
- v0.7 Messaging admin test
- v0.6 Voice greeting improvements
- v0.5 Twilio webhooks
- v0.4 Strengthened Terms
- v0.3 Public SMS opt-in
- v0.2 Public policy routes
- v0.1 Production scaffold
