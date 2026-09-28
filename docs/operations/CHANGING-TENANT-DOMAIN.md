# Changing the Product and Tenant Domains

BandWagon has two domain settings. They default to `bandwagon.club` (moved from the Harrison Ward Technology domains on 2026-09-27; that specific move is in [MOVE-TO-BANDWAGON-CLUB.md](MOVE-TO-BANDWAGON-CLUB.md)). Use this general guide for any future domain change.

| Setting | Default | What it controls |
|---|---|---|
| `PLATFORM_HOSTNAMES` | `bandwagon.club,www.bandwagon.club` | Hostnames that serve the product site instead of a tenant. The first one is the primary host, used for metadata, the phone greeting, and link fallbacks. `localhost` and `127.0.0.1` are always included. |
| `TENANT_BASE_DOMAIN` | `bandwagon.club` | Parent domain for new default tenant hostnames: `<slug>.<TENANT_BASE_DOMAIN>`. Also blocks custom domains under this parent. |
| `LEGACY_PLATFORM_HOSTNAMES` / `LEGACY_TENANT_BASE_DOMAINS` | the old harrisonward hosts | Old hosts whose page visits redirect to the new ones. API calls and webhooks on them are still served. Set to empty to turn off. |
| `APP_URL` | none | Canonical public URL used for Twilio callbacks, Stripe return URLs, OAuth, and email links. |

Both settings live in `apps/web/src/lib/platform-hosts.ts`. Nothing in the app hardcodes the old domains except those defaults.

**Important:** changing `TENANT_BASE_DOMAIN` only affects communities created afterward. Existing communities keep their `organizations.tenant_hostname` and their `organization_domains` rows. Move them with `npm run tenants:move-domain -- --from <old> --to <new>` (dry run first, then `--apply`). The FloMoGo seed migration is left as is.

## Example

Moving from `bandwagon.club` to a new product domain, `bandwagonrides.com`:

- Product site: `bandwagonrides.com` and `www.bandwagonrides.com`
- Tenants: `<slug>.bandwagonrides.com` (for example `flomogo.bandwagonrides.com`)

## Step 1. DNS and Cloudflare

1. Add the new zone to Cloudflare.
2. Create records for the product site: `bandwagonrides.com` and `www` pointing at the Coolify server (or the Traefik load balancer).
3. Create a wildcard record `*.bandwagonrides.com` pointing at the same target, so every tenant hostname resolves.
4. If you use Cloudflare for SaaS custom hostnames, set the fallback origin in the new zone and update `CLOUDFLARE_SAAS_ZONE_ID` if the custom hostname zone changes. Existing customer custom domains CNAME to their tenant hostname, so update them only if you retire the old tenant hostnames.
5. Keep the old zone and its wildcard record active. Old links must keep working.

## Step 2. Coolify and Traefik certificates

1. Wildcard certificates need a DNS challenge. In Coolify, configure Traefik with a Cloudflare DNS challenge provider (a Cloudflare API token scoped to DNS edit on the new zone).
2. Add a router rule for the new hosts. For the HA layout, extend the web label in `docker-compose.coolify.ha.yml`, for example:
   ``Host(`bandwagonrides.com`) || Host(`www.bandwagonrides.com`) || HostRegexp(`{sub:[a-z0-9-]+}.bandwagonrides.com`)``
   with `tls.certresolver` set to the DNS challenge resolver and `tls.domains[0].main=bandwagonrides.com`, `tls.domains[0].sans=*.bandwagonrides.com`.
3. Keep the old host rules in place until Step 7.
4. Deploy and confirm `https://anything.bandwagonrides.com/api/health/live` returns 200 with a valid certificate.

## Step 3. Update environment variables

In Coolify, for every role (web, worker, migrate):

```text
PLATFORM_HOSTNAMES=bandwagonrides.com,www.bandwagonrides.com,bandwagon.club,www.bandwagon.club
TENANT_BASE_DOMAIN=bandwagonrides.com
APP_URL=https://bandwagonrides.com
```

Keep the old platform hosts in `PLATFORM_HOSTNAMES` so they still serve the product site (and can redirect later). Redeploy. New communities now get `<slug>.bandwagonrides.com`.

## Step 4. Add new hostnames for existing communities

For each existing organization, add a new active domain row and make it primary. Keep the old row active.

```sql
-- Example for one organization. Repeat per org, or script it.
insert into organization_domains (organization_id, hostname, status, is_primary, domain_type)
select id, slug || '.bandwagonrides.com', 'active', false, 'platform'
from organizations where slug = 'flomogo'
on conflict do nothing;
```

Then use `/admin/tenants` (Set Primary) or update `is_primary` and `organizations.tenant_hostname` so the new hostname is primary. Check the actual column values in your database first (`\d organization_domains`), and take a backup before running bulk updates.

Because `resolveTenant` matches any active domain row, the old and new hostnames both load the same community.

## Step 5. OAuth, Twilio, Stripe, and other provider URLs

| Provider | What to change |
|---|---|
| Google OAuth (Calendar) | Add `https://bandwagonrides.com/api/integrations/google/callback` to authorized redirect URIs. Update `GOOGLE_REDIRECT_URI`. Keep the old URI until every admin has reconnected or tokens have refreshed. |
| Microsoft Entra (Calendar) | Add `https://bandwagonrides.com/api/integrations/microsoft/callback` as a Web redirect URI. Update `MICROSOFT_REDIRECT_URI`. |
| Twilio | Update the Messaging Service inbound webhook to `https://bandwagonrides.com/api/webhooks/twilio/inbound`, the voice webhook to `/api/webhooks/twilio/voice`, and the voice status callback. Status callbacks follow `APP_URL` automatically. Check that your A2P 10DLC campaign and toll-free verification list the new website and opt-in page (`/sms-opt-in`); update them with Twilio if needed. |
| Stripe | Add a webhook endpoint for `https://bandwagonrides.com/api/webhooks/stripe`, set the new `STRIPE_WEBHOOK_SECRET`, then disable the old endpoint. Checkout return URLs follow `APP_URL`. Update the business website in Stripe settings. |
| Cloudflare Turnstile | Add the new hostnames (and the wildcard parent) to the Turnstile widget's allowed domains. |
| Google Maps browser key | Add the new domains to the key's HTTP referrer restrictions. |
| Web push (VAPID) | No change. Existing subscriptions are tied to the old origin, so users on the old hostname keep receiving push until they re-enable on the new one. |
| DoDomain | Update the return URL and webhook URL in the DoDomain dashboard. |
| Uptime Kuma | Add monitors for the new hostnames. The status monitoring job registers each community's `tenant_hostname`, so it follows the primary hostname after Step 4. |
| SMTP2GO | Update sender domain (SPF, DKIM) if email moves to the new domain. Update `EMAIL_FROM`. |

## Step 6. Redirect old hostnames

After the new hostnames are working, redirect old hostnames to new ones so bookmarks and installed PWAs land in the right place. Use a Traefik `redirectregex` middleware on the old router, for example:

```text
regex:       ^https://([a-z0-9-]+)\.harrisonward\.org/(.*)
replacement: https://${1}.bandwagonrides.com/${2}
permanent:   true
```

Do not redirect `/api/webhooks/*` until every provider in Step 5 points at the new domain. A redirected webhook POST will fail.

Tell families ahead of time. Installed PWAs keep their original origin, so users may need to reinstall from the new address. Sessions are per hostname, so users sign in again once.

## Step 7. Retire the old domain (much later)

Keep the old domains redirecting for at least a full school year. Then remove the old hosts from `PLATFORM_HOSTNAMES`, remove old `organization_domains` rows (or set them inactive), remove the old Traefik routers, and let the old certificates expire.

## Checklist

- [ ] New zone, product records, and wildcard in Cloudflare
- [ ] Wildcard certificate issued through the DNS challenge
- [ ] `PLATFORM_HOSTNAMES`, `TENANT_BASE_DOMAIN`, `APP_URL` updated on every role
- [ ] New primary domain row for every existing organization
- [ ] Google, Microsoft, Twilio, Stripe, Turnstile, Maps, DoDomain updated
- [ ] Uptime Kuma monitors for new hostnames
- [ ] Old hostnames redirect, webhooks excluded
- [ ] Families told about the new address
