# BandWagon Changelog

## v1.0.0-rc1 - Unreleased

### October 2026 Known Issue Fixes

Messaging:

- **Brand name in every text.** Every SMS/RCS body now starts with `BandWagon: ` (waitlist offers, route assist, "Your driver is on the way.", and the rest). Bodies that already start with "BandWagon" are left alone. Push and email are unchanged. `docs/SMS-CONSENT-AND-TEXTS.md`.
- **Web opt-in after a carrier STOP.** Opting in on the web no longer reports success while Twilio is still blocking the number. Nothing is changed, no welcome text is sent, and the person is told to text START. A carrier STOP is never cleared from the web.
- **Delivery log shows the real channel.** The Twilio status callback now corrects `notification_deliveries.channel` to `rcs` or `sms`, and keeps the requested channel in `metadata`.
- **One rule for picking a phone row.** The send path, the settings status, and the router all use `verifiedPhoneOrderBy`.
- **Trusted adult notifications have router policies.** `household_delegate_activity` (important, push then email) and `household_delegate_invitation` (email only). Neither is ever texted. A new test keeps the table in `docs/NOTIFICATION-ROUTING.md` in step with the code.
- **Waitlist texting docs corrected.** `docs/WAITLISTS.md` now says what really happens: standby offers are push or email for most people, and a cancelled carpool texts every waitlisted rider who agreed to texts. No behavior change.

Security:

- **No hard-coded fallback hash key.** Rate-limit and IP hashes no longer fall back to a fixed string when `AUTH_SECRET` and `DATA_ENCRYPTION_KEY` are both unset. The code now throws (`apps/web/src/lib/private-hash.ts`) and the affected public forms answer 503. Fixed in `feature-requests.ts`, `organization-requests.ts`, `routing-provider.ts`, and five API routes with the same pattern. Hash values are unchanged for a configured deployment. `docs/SECURITY-DEPLOYMENT.md`.
- **Demo security headers.** `demo/nginx.conf` now repeats `Referrer-Policy`, `X-Frame-Options` and `Permissions-Policy` in every location that sets its own headers, so they are no longer dropped on the page, service worker, manifest, and static files.

Households and events:

- **Request-only trusted adults see their own requests.** A delegate with only "Ask For Rides" now sees a short status line for requests they created. No pickup details, drivers, offers, or other people's requests.
- **The organization's trusted adult setting can no longer be skipped.** `canActForChild` refuses every delegate grant when no organization is passed. Guardians and the child are not affected.
- **Settings permissions are consistent.** Turning trusted adults off for an organization now needs an owner or admin, the same as event proposal settings. Managers can still see the setting. (Behavior change for managers.)
- **No inviting your own phone number.** The self-invite check now covers phone invites as well as email.
- **Stale event proposals.** Approving a proposal whose start time has passed gives a clear message. Turning proposals off puts queued ones on hold (kept, declinable, not approvable until the feature is back on) and tells the admin how many are waiting. Nothing is deleted. `docs/EVENT-PROPOSALS.md`.

Config and docs:

- **Synthetic check skips cleanly.** `production-synthetic.yml` no longer fails every hour when `PRODUCTION_URL` is unset. It finishes green with a notice. The schedule is unchanged.
- **Reserved example domain.** `docs/operations/CHANGING-TENANT-DOMAIN.md` now uses `example.org` instead of `bandwagonrides.com`.

### September 2026 Wave (PRs #35 to #50)

- **New logo: Route To The Show** (#46). Site icons, PWA icons, header wordmark, Stripe logo, share card, BIMI, README image, Google sign-in logo (`/brand/google-oauth-logo-120.png`) and RCS images (`/brand/rcs-*.png`, #49). File list in `docs/BRANDING.md`.
- **SMS welcome and opt-in links** (#45). One carrier-compliant welcome text on a new opt-in; HELP text constant; Terms, Privacy and Messaging links at every opt-in; `/sms-opt-in` has an enabled button. `docs/SMS-CONSENT-AND-TEXTS.md`.
- **Next wave features** (#37): SEO (sitemap, robots, JSON-LD, X-Robots-Tag), feature request form, passkeys, seat waitlists, member event proposals, trusted household delegates. Migrations 057 to 062.
- **Demo refresh** (#39, #47, #48): moved to `demo.bandwagon.club`, new logo and icons, BandWagon naming, phone layout fix, nginx caching, service worker, and automatic content-hash cache busting.
- **Custom hostname certs pinned to Google CA** (#38).
- **Contact emails on bandwagon.club** (#35), `security.txt`, BIMI SVG (#36).
- **Status page link** in header and footer (#41). Old `harrisonward.net`/`.org` crumbs removed from docs (#40).
- **Title Case everywhere** (#42, #43, #44) with a guard test; HSTS header and 7-day cache on `/icons` and `/brand` (#44).
- **Docs refresh**: docs index, new ops guides (email, Cloudflare, Google verification), new feature guides, notification routing table rebuilt from code, stale setup notes moved to `docs/archive/`.

### Earlier In RC1

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
