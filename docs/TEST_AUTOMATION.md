# BandWagon Test Automation

## Unit And Guard Tests

Run from `apps/web`:

```sh
npm test
```

This runs `node --test --experimental-strip-types tests/*.test.ts`. It needs Node 22 (the version CI uses). No database, Redis, or network is needed. Most suites test pure policy files that have no imports, and some read source files to guard against regressions.

Current result (September 2026): **257 tests in 41 files, all passing.** Update this line when the count changes.

### Notable Guard Tests

These check the codebase itself, not one feature, and are the ones most likely to fail on an unrelated change:

| Test | What It Guards |
| --- | --- |
| `tests/title-case-ui.test.ts` | Literal text inside `<label>` and `<button>` in `src/app` and `src/components` uses Title Case (every word capitalized). Full sentences ending in `.`, `?`, or `!` and a short list of exceptions (`e.g.`, `km`, `iOS`) are skipped. |
| `tests/sms-consent-policy.test.ts` | Ride texts need an affirmative opt-in, STOP always wins, signup boxes start unchecked, consent text has the carrier disclosures, and every opt-in shows Terms and Privacy links and sends one welcome text. |
| `tests/seo.test.ts` | Robots rules for platform, tenant, and staging hosts, `noindex` on signed-in and tenant pages, the sitemap, canonical origin, safe JSON-LD, and HSTS and cache headers. |
| `tests/sql-parameter-types.test.ts` | No insert feeds one uncast `$N` into both `audit_events.target_id` (text) and a uuid column. Postgres rejects that at run time. |
| `tests/legal-pages.test.ts` | Legal pages show the draft banner, carry versions, and avoid em dashes and certification claims. |
| `tests/production-readiness.test.ts` | The release environment check fails closed and never prints configured values. |
| `tests/platform-hosts.test.ts` | Platform, tenant, and legacy redirect host rules. |
| `tests/pwa-policy.test.ts`, `tests/accessibility-shell.test.ts` | The PWA caches only a public offline shell, and the app shell keeps its keyboard and status helpers. |

Several feature suites also check that user-facing copy has no em dashes: passkeys, waitlists, event proposals, household delegates, feature requests, onboarding, and sponsors.

### Feature Suites

Each larger feature has a policy suite. See the feature docs for details:

- `tests/passkey-policy.test.ts` ([PASSKEYS.md](PASSKEYS.md))
- `tests/ride-waitlist-policy.test.ts` ([WAITLISTS.md](WAITLISTS.md))
- `tests/event-proposals.test.ts` ([EVENT-PROPOSALS.md](EVENT-PROPOSALS.md))
- `tests/household-delegate-policy.test.ts` ([HOUSEHOLD-DELEGATES.md](HOUSEHOLD-DELEGATES.md))
- `tests/feature-requests.test.ts` ([FEATURE-REQUESTS.md](FEATURE-REQUESTS.md))

## Pull Requests And Main

`.github/workflows/web-build.yml` ("Web Build") runs on pull requests and pushes to `main` that touch `apps/web/**` or the workflow file. It starts Postgres (PostGIS 17) and Redis 7 as services, then:

1. Installs dependencies and Playwright's Chromium.
2. Applies every migration (`npm run db:migrate`), verifies the schema (`npm run db:verify`), and applies the migrations a second time to prove they are repeatable.
3. Runs the unit and guard tests (`npm test`).
4. Runs the TypeScript check (`npm run typecheck`).
5. Builds the production server (`npm run build`).
6. Starts the built server with CI-only placeholder secrets, waits for `/api/health/live`, then runs:
   - `npm run test:e2e`: Playwright specs in `apps/web/e2e`. `ride-workflow.spec.ts` walks an organizer-created event, a parent request, a driver offer, parent acceptance, and driver completion, and checks that a regular member gets 403 when creating organizer events. `privacy-consent.spec.ts` checks that rejecting optional storage is as easy as accepting it and that the choice persists.
   - `npm run release:smoke`: calls the ride reminder, platform budget, safety maintenance, and privacy maintenance cron endpoints, then deep health.
   - `npm run perf:smoke`: 300 requests at concurrency 20, failing if p95 is over 1,000 ms or any request errors.

On failure, the Playwright report and test results are uploaded for 14 days.

## Production Synthetic

`.github/workflows/production-synthetic.yml` runs hourly (minute 17) and on demand. It checks live, ready, and deep health at the repository variable `PRODUCTION_URL` without signing in, changing data, or sending messages. If `PRODUCTION_URL` is not set, the job fails with a message asking for it.

For an object-storage read, write, and delete canary, add this Coolify scheduled task to the existing web container:

```sh
SYNTHETIC_S3_CANARY=true npm run ops:synthetic
```

The canary always attempts to delete its randomly named test object. It does not print credentials or secret values.

Calendar synchronization can be scheduled in Coolify without fragile inline JavaScript:

```sh
npm run cron:google-calendar-sync
npm run cron:microsoft-calendar-sync
```

## Local End-To-End Run

Run the migrated application and database, then use:

```sh
E2E_BASE_URL=http://127.0.0.1:3000 npm run test:e2e
```

The test needs the same `DATABASE_URL`, `DATABASE_SSL`, and `AUTH_SECRET` used by the running application. Never point mutation tests at production.

## Demo Site

The demo at https://demo.bandwagon.club lives in `demo/` and is a separate static app (nginx, fake data only). It has no automated tests, and the Web Build workflow does not run for changes there. After changing `demo/nginx.conf` or the demo files, check by hand:

- The Docker image builds (`demo/Dockerfile` fails the build if the cache-busting hash is not stamped into `index.html`).
- `/`, `/index.html`, and `/sw.js` return `Cache-Control: no-cache`. CSS, JS, icons, and the manifest return a one year `immutable` cache.
- Security headers are present, including HSTS and `X-Content-Type-Options: nosniff`.
- Unknown paths fall back to `index.html`, and the page installs and reloads offline.

See `demo/README.md` for the caching design and [operations/DEMO-SITE.md](operations/DEMO-SITE.md) for running the demo.

## Still External

Twilio and calendar-provider approval cannot be simulated by BandWagon. Keep their sandbox and provider checks separate. A restore drill is available through `npm run ops:verify-backup-restore` and should run monthly against an isolated restore database.
