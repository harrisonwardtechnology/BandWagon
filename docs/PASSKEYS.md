# Passkeys (WebAuthn)

Passkeys let people sign in with their face, fingerprint, or screen lock instead of typing a one-time code. Codes by email and SMS keep working; a passkey is an extra option, never a requirement.

## How it works for people

- **Add a passkey:** Settings, then Security (`/app/settings/security`). Adding one needs a sign-in within the last 10 minutes. If the session is older, the page asks the person to sign in again (it returns them to the Security page afterwards).
- **Manage passkeys:** the same page lists every passkey with its name, when it was added and last used, whether it syncs across devices, and which site it works on. People can rename or remove any passkey.
- **Sign in:** the login page shows **Sign in with a passkey** when the browser supports it. Where the browser supports conditional UI, saved passkeys also appear in the email field's autofill list.
- **Email notice:** when a passkey is added, BandWagon emails the person's first verified email address (best effort; if there is no verified email, no notice is sent).

## Relying party ID (which site a passkey belongs to)

A passkey is bound to a domain, called the relying party ID (RP ID). BandWagon picks it from the request host:

| Host | RP ID | Notes |
| --- | --- | --- |
| `bandwagon.club`, `www.bandwagon.club` | `bandwagon.club` | Platform hosts (`PLATFORM_HOSTNAMES`). |
| `<slug>.bandwagon.club` | `bandwagon.club` | Must be an active `organization_domains` row. One passkey works on the platform and every community subdomain. |
| Custom domain, e.g. `flomogo.app` | `flomogo.app` | Must be an active `organization_domains` row. The RP ID is the exact hostname, so `www.flomogo.app` would be its own RP ID. |
| Legacy redirect hosts (`*.harrisonward.org`, `bandwagon.harrisonward.net`) | none | Page visits there redirect, so passkeys are never offered. |
| `localhost` | `localhost` | Development only (`NODE_ENV` is not `production`). |
| Anything else | none | Passkey endpoints refuse the request. |

Each credential stores its `rp_id`. Sign-in only accepts a credential whose `rp_id` equals the current host's RP ID. A person who uses both `bandwagon.club` and `flomogo.app` needs a passkey on each (the Security page says which site each passkey works on).

The base domain comes from `TENANT_BASE_DOMAIN` (default `bandwagon.club`). Changing it later orphans existing passkeys for the old domain; people fall back to codes and can add a new passkey.

## Origin checks

- The host is taken from `x-forwarded-host` or `host`, then accepted only if it is a configured platform host or an active, verified organization domain from the database. Arbitrary Host headers never produce a relying party.
- The browser's `Origin` header must equal `https://<that host>` (or `http://localhost:<port>` in development).
- The expected origin and RP ID passed to SimpleWebAuthn come from that validated host, so the browser-signed `clientDataJSON` must match exactly.
- Each stored challenge records the RP ID and origin it was issued for, and is rejected if finished on another host.

## Challenges

- Stored in Redis (`bandwagon:webauthn:<flow>`, 5 minute TTL, read and deleted in one `MULTI`) when `REDIS_URL` is set. If Redis is unset or unavailable, the `webauthn_challenges` table is used (`DELETE ... RETURNING`, expiry checked).
- Registration challenges are bound to the signed-in session and the user account.
- Sign-in challenges are bound to a random flow ID in an httpOnly, `SameSite=Strict` cookie (`bw_passkey_flow`, path `/api/auth/passkey`, 5 minutes).
- Every challenge is single use.

## Account rules

Passkey sign-in runs the same post-sign-in step as code sign-in (`completeSignIn` in `src/lib/auth-service.ts`: `last_login_at`, an `auth_events` row, and a normal `bw_session` cookie). Before that, `findSignInEligibleAccount` applies the same restrictions as email code sign-in:

- the person and the user account must both be `active` (suspended, deleting, or deleted accounts cannot sign in);
- a managed student can sign in only while guardian-enabled access and active guardian consent both exist, and only with a passkey added under the login email the guardian currently authorizes. Each managed student passkey records that email (`webauthn_credentials.login_email_id`, migration `062_passkey_login_email.sql`), and sign-in requires it to still equal `managed_student_account_access.login_email_id`, the same rule email code sign-in uses.
- when a guardian turns a student's sign-in off, switches the authorized login email (for example because the old one was compromised), or revokes the last active consent, the student's passkeys are deleted. Migration 062 also removes managed student passkeys created before the column existed; those students sign in with a code and can add a new one.

Support View cannot add, rename, or remove passkeys. Account deletion removes all passkeys, and the data export lists passkey names and dates (not keys).

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /api/auth/passkey` | `{ enabled, rpId }` for the login page. |
| `POST /api/auth/passkey` `{action:"options"}` | Starts sign-in (discoverable credentials, user verification required). |
| `POST /api/auth/passkey` `{action:"verify", response}` | Finishes sign-in and sets the session cookie. |
| `GET /api/auth/passkeys` | Security page status and passkey list (signed in). |
| `POST /api/auth/passkeys` `register_options` / `register_verify` / `rename` | Add or rename a passkey. |
| `DELETE /api/auth/passkeys?id=` | Remove a passkey. |

## Rate limits

Stored in `auth_rate_limit_events`, per rolling window:

- 30 sign-in starts per IP per 15 minutes;
- 20 failed passkey sign-ins per IP per 15 minutes;
- 10 registration starts per account per hour;
- at most 20 passkeys per person.

## Audit trail

- `audit_events`: `auth.passkey_added`, `auth.passkey_renamed`, `auth.passkey_removed`, `auth.passkey_sign_in` (target type `webauthn_credential`).
- `auth_events`: `passkey_added`, `passkey_removed`, `passkey_sign_in`, `passkey_sign_in_failed` (with a reason such as `unknown_credential` or `account_restricted`).

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `PASSKEYS_ENABLED` | on | Set to `false` to hide the passkey button and settings and refuse new ceremonies. Removing existing passkeys still works. |
| `REDIS_URL` | unset | Optional challenge store. |
| `PLATFORM_HOSTNAMES`, `TENANT_BASE_DOMAIN` | bandwagon.club | Decide the RP ID (see above). |

## Database

Migration `058_passkeys.sql` adds `webauthn_credentials`, `webauthn_challenges`, and `auth_rate_limit_events`. Expired challenges and old rate-limit rows are purged by the privacy maintenance job.

## Optional improvement: WebAuthn Related Origins

Browsers that support [Related Origin Requests](https://passkeys.dev/docs/advanced/related-origins/) let a site use a passkey whose RP ID is a different domain, if that domain lists the site at `https://<rpId>/.well-known/webauthn`. BandWagon could serve, on `bandwagon.club`:

```json
{ "origins": ["https://bandwagon.club", "https://flomogo.app"] }
```

and then use RP ID `bandwagon.club` on custom domains too, so one passkey works everywhere. This is **not implemented** because browser support is still partial (Chrome and Safari; not yet Firefox), the list is limited to a small number of distinct registrable domains, and existing custom-domain passkeys would need migrating. Revisit when support is broad.

## Manual checks after deploy

1. Run migrations (`npm run db:migrate`) and `npm run db:verify`.
2. On `bandwagon.club`: sign in with a code, add a passkey in Settings, then Security, sign out, and sign in with the passkey. Confirm the notice email arrives.
3. On a community subdomain: sign in with the same passkey.
4. On a custom domain: confirm the platform passkey is not offered there, then add a domain passkey and sign in with it.
5. Suspend a test account and confirm its passkey no longer signs in.
6. Set `PASSKEYS_ENABLED=false` and confirm the button and add option disappear.
