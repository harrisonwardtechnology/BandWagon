# BandWagon Staging Environment

Staging is a full copy of BandWagon that runs the code you are about to ship, against fake data, with messaging locked down. Use it to test a build before it goes to production.

## Rules That Never Bend

1. **Never production data.** Staging has its own database. Never restore a production backup into staging, and never point staging at the production database, Redis, or S3 bucket.
2. **Never production secrets.** Generate new `AUTH_SECRET`, `DATA_ENCRYPTION_KEY`, and `LOOKUP_HASH_KEY` values. Use test or separate credentials for every provider.
3. **Messaging sandbox is always on.** Staging only texts and emails people on an allowlist. Everyone else is recorded as skipped.
4. **Staging is visibly staging.** A red STAGING banner shows on every page, and responses carry `X-Robots-Tag: noindex, nofollow`.

## What The Compose File Sets Up

`docker-compose.coolify.staging.yml` at the repo root runs:

| Service | What it is |
|---|---|
| `app` | One BandWagon container with `APP_ROLE=all` (web and worker together). Runs migrations, then starts the server. |
| `postgres` | Its own PostGIS database (`bandwagon_staging`) on its own volume. |
| `redis` | Its own Redis on its own volume. |

Key settings baked into the file:

| Variable | Value | Why |
|---|---|---|
| `NEXT_PUBLIC_ENVIRONMENT` | `staging` | Shows the STAGING banner. The app also forces the messaging sandbox on when this is `staging`. Set as a build arg and a runtime variable. |
| `MESSAGING_SANDBOX` | `true` | SMS and email go only to the allowlists. |
| `NOTIFICATION_DELIVERY` | `queue` | Exercises the same job queue path as production. |
| `APP_URL` | `https://staging.bandwagon.club` by default | Used for links, Twilio status callbacks, and Stripe return URLs. |
| `PLATFORM_HOSTNAMES` | the staging hostname | Staging answers as the product site on its own hostname. |
| `TENANT_BASE_DOMAIN` | `staging.bandwagon.club` by default | Staging tenants never share production's tenant domain. |

## How The Messaging Sandbox Works

- `MESSAGING_SANDBOX=true` (or `NEXT_PUBLIC_ENVIRONMENT=staging`, or `APP_ENVIRONMENT=staging`) turns it on.
- `SANDBOX_ALLOWED_PHONES` is a comma list of E.164 numbers, for example `+19725550100,+19725550101`.
- `SANDBOX_ALLOWED_EMAILS` is a comma list of addresses, for example `qa@bandwagon.club`.
- A message to anyone else never reaches Twilio or SMTP2GO. It is written to `notification_deliveries` with status `sandbox_skipped` and the reason in `metadata`, so you can still see what would have been sent.
- An empty allowlist blocks everyone. That is the safe default.
- Sign-in codes follow the same rule. To sign in to staging, put your own phone or email on the allowlist.
- The sandbox decision lives in `apps/web/src/lib/messaging-sandbox-policy.ts` and is checked in both `twilio-send.ts` and `email-send.ts` before any provider call.

`npm run release:check-env` fails if `MESSAGING_SANDBOX=true` in a production environment, so the flag cannot leak into production by accident.

## Coolify Setup, Step By Step

1. **Create a separate Coolify project** (or at least a separate environment) named `BandWagon Staging`. Do not add staging resources to the production project.
2. **Add a resource** from the GitHub repo using the **Docker Compose** build pack, and set the compose file to `docker-compose.coolify.staging.yml`.
3. **Pick the branch.** Point staging at the branch you want to test (for example `main`, or a release branch).
4. **Leave the Domains field empty.** Routing comes from the Traefik labels. Set `STAGING_HOSTNAME` if you use a hostname other than `staging.bandwagon.club`.
5. **DNS.** Add a DNS record for the staging hostname pointing at the Coolify server. If you test tenant hostnames, add a wildcard for `*.staging.bandwagon.club` too.
6. **Environment variables** in Coolify:
   - `STAGING_POSTGRES_PASSWORD` (new random value)
   - `AUTH_SECRET`, `DATA_ENCRYPTION_KEY`, `LOOKUP_HASH_KEY` (new random values, 32+ characters, all different)
   - `SANDBOX_ALLOWED_PHONES`, `SANDBOX_ALLOWED_EMAILS` (your test phones and inboxes)
   - `APP_URL` if the hostname differs from the default
   - Optional: `NEXT_PUBLIC_HELP_DESK_URL`, `NEXT_PUBLIC_STATUS_PAGE_URL` (mark as build variables)
7. **Provider credentials, staging only:**
   - **Twilio:** use Twilio test credentials, or a separate Twilio subaccount with its own messaging service. The sandbox flag is the backstop, not a reason to reuse production creds.
   - **SMTP2GO:** a separate sender or API key, so staging mail is easy to spot.
   - **Stripe:** test mode keys (`sk_test_...`) and a test webhook secret.
   - **S3:** a separate private bucket, never the production bucket.
   - **Google and Microsoft OAuth:** add the staging callback URLs to the app registrations, or leave these blank to turn calendar sync off.
   - **Turnstile:** a separate site key for the staging hostname, or Cloudflare's test keys.
   - **AI:** leave `AI_RUNTIME_ENABLED` unset unless you are testing AI features.
8. **Deploy.** The app container runs `scripts/migrate.mjs` and then starts. Wait for the health check to go green.
9. **Check it.** Open the staging URL. You should see the red STAGING banner. Open `/status` and confirm the live check says Up. Sign in with an allowlisted email.
10. **Seed test data by hand** (a test organization, fake households, fake events). Never import real member lists.

## Promoting A Build To Production

Staging and production build the same Dockerfile from the same Git commit, so promotion means "deploy the commit you tested."

1. Note the exact Git commit SHA running in staging (Coolify shows it on the deployment).
2. Run through the release checks on staging: sign in, create a ride request, offer and accept a ride, pickup handshake, notification preferences, privacy export, and `/api/health/deep`.
3. Confirm there are no unexpected `sandbox_skipped` rows for allowlisted recipients, which would mean a real send failed.
4. Merge or fast-forward that exact commit to the production branch. Do not add new commits between testing and promotion.
5. Run `npm run release:check-env` (or `release:check-env:flomogo`) against the production environment.
6. Deploy production in Coolify. Migrations run first (see `docker-compose.coolify.ha.yml` or the single-container setup), then web and workers restart.
7. Watch `/status`, `/api/health/deep`, and Uptime Kuma for 15 minutes.

Do not promote by copying a staging container or database. Always rebuild production from Git.

## Resetting Staging

Staging data is disposable. To start fresh, stop the resource, delete the `staging-postgres-data` and `staging-redis-data` volumes in Coolify, and redeploy. Migrations recreate the schema.
