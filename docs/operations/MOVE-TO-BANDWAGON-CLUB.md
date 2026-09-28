# Moving BandWagon To bandwagon.club

| | Before | After |
|---|---|---|
| Product site | `bandwagon.harrisonward.net` | `bandwagon.club` (and `www.bandwagon.club`) |
| Communities | `<slug>.harrisonward.org` | `<slug>.bandwagon.club` |
| Custom domains (`flomogo.app`) | unchanged | unchanged |

The code already defaults to bandwagon.club. The old hosts keep working:

- **Page visits** to `bandwagon.harrisonward.net` or `<slug>.harrisonward.org` get a permanent (308) redirect to the new host, keeping the path and query.
- **API calls and webhooks** on the old hosts are served, not redirected. Twilio, Stripe, and DoDomain keep working until you update them.
- **Twilio signatures** are accepted for both the old and new host.

Turning the redirects off later: set `LEGACY_PLATFORM_HOSTNAMES=""` and `LEGACY_TENANT_BASE_DOMAINS=""`.

## What Users Notice

- **One extra sign-in.** Sign-in cookies belong to a hostname, so everyone signs in again once on the new domain.
- **Installed home-screen app.** It opens the old address and gets redirected. Reinstalling from the new address is cleaner. Push notifications keep arriving.
- **Old links in texts and emails** keep working through the redirect.

## Step 1. Cloudflare

1. Add `bandwagon.club` as a zone in Cloudflare and switch the registrar's nameservers to Cloudflare's. Wait until the zone shows **Active**.
2. In **Zero Trust > Networks > Tunnels > "Ionos - Coolify" > Public hostnames**, add three routes. Point each at the same service the current BandWagon route uses. Today that's `https://localhost:443` with **No TLS Verify** on, per your tunnel notes.
   - `bandwagon.club`
   - `www.bandwagon.club`
   - `*.bandwagon.club`
3. **SSL/TLS > Edge Certificates:** confirm Universal SSL is active. It covers `bandwagon.club` and `*.bandwagon.club`, which is every community host. Turn on **Always Use HTTPS**.
4. **Don't delete anything** for `harrisonward.org` or `bandwagon.harrisonward.net`. The redirects and `flomogo.app` depend on them.
5. **Custom domains (Cloudflare for SaaS):** leave them alone for now. `flomogo.app` points at `flomogo.harrisonward.org`, which stays up.

## Step 2. Coolify (HWTVPS01)

Set these environment variables on BandWagon (every role, if you're on the HA compose file):

```
APP_URL=https://bandwagon.club
PLATFORM_HOSTNAMES=bandwagon.club,www.bandwagon.club
TENANT_BASE_DOMAIN=bandwagon.club
GOOGLE_REDIRECT_URI=https://bandwagon.club/api/integrations/google/callback
MICROSOFT_REDIRECT_URI=https://bandwagon.club/api/integrations/microsoft/callback
```

**Routing, HA compose (recommended):** `docker-compose.coolify.ha.yml` already routes every hostname to BandWagon. Leave the Domains fields empty.

**Routing, single container:** Coolify's Domains field needs `https://bandwagon.club,https://www.bandwagon.club` plus every community host. Keep the old `bandwagon.harrisonward.net` and `*.harrisonward.org` entries too, or the redirects and old webhooks stop reaching the app. A wildcard in that field isn't reliable, which is one more reason to move to the HA compose file.

Redeploy. Migrations run on their own in the HA setup.

## Step 3. Move Existing Communities

Coolify's terminal doesn't work on HWTVPS01, so use SSH:

```bash
# Dry run: shows what would change
docker exec -it <bandwagon web container> node scripts/move-tenant-domain.mjs --from harrisonward.org --to bandwagon.club
# Apply
docker exec -it <bandwagon web container> node scripts/move-tenant-domain.mjs --from harrisonward.org --to bandwagon.club --apply
```

For each community, the script:

- adds `<slug>.bandwagon.club` and makes it primary
- keeps `<slug>.harrisonward.org` active, so it can redirect
- updates the community's main hostname
- re-points custom domains that aren't live yet

Custom domains that are already live (like `flomogo.app`) keep their current target, so nothing breaks. It's safe to run twice.

## Step 4. Outside Services

Do the Google and Microsoft items **in the same sitting as Step 2**. The calendar sign-in callback has to land on the domain where the admin is signed in.

| Service | Change |
|---|---|
| **Google Cloud Console** (OAuth client) | Add redirect URI `https://bandwagon.club/api/integrations/google/callback`. Add `bandwagon.club` under Authorized domains on the consent screen. That requires verifying the domain in Google Search Console. The Google consent verification on the launch checklist must use the new domain. |
| **Microsoft Entra** (app registration) | Add redirect URI `https://bandwagon.club/api/integrations/microsoft/callback`. |
| **Google Maps keys** | Add `bandwagon.club/*` and `*.bandwagon.club/*` to the browser key's website restrictions. |
| **Twilio** (number / Messaging Service) | Change the webhooks to `https://bandwagon.club/api/webhooks/twilio/inbound`, `.../twilio/status`, `.../twilio/voice`, and `.../twilio/voice/status`. The old URLs keep working until you do. |
| **Twilio RCS registration** | If it isn't submitted yet, use the new URLs: `https://bandwagon.club/privacy`, `/terms`, `/sms-opt-in`, and the carrier test instructions. If it's already submitted, the old URLs redirect, but ask Twilio support whether the brand website should be updated so reviewers see one domain. |
| **Stripe** | Change the webhook endpoint to `https://bandwagon.club/api/webhooks/stripe`. The signing secret stays the same if you edit the endpoint instead of recreating it. Checkout return links follow `APP_URL` on their own. |
| **Cloudflare Turnstile** | Add `bandwagon.club` to the widget's hostnames. Keep the old ones for now. |
| **DoDomain** | Change the webhook URL to `https://bandwagon.club/api/webhooks/dodomain`. |
| **Uptime Kuma** | Point the BandWagon monitors at `https://bandwagon.club/api/health/ready` and `/api/health/deep`. Add one for `https://flomogo.bandwagon.club/`. |
| **GitHub** | Set the repo "Website" to `https://bandwagon.club`. |
| **Demo site** (done) | Moved `bandwagon-demo.harrisonward.net` to `demo.bandwagon.club`, then update `DEMO_URL` in `src/app/ProductHome.tsx` and `src/components/public-site-header.tsx`. |

## Step 5. Check It

- [ ] `https://bandwagon.club` shows the product site. `https://www.bandwagon.club` does too.
- [ ] `https://bandwagon.harrisonward.net/login` redirects to `https://bandwagon.club/login`.
- [ ] `https://flomogo.bandwagon.club` shows FloMoGo. `https://flomogo.harrisonward.org` redirects there.
- [ ] `https://flomogo.app` still shows FloMoGo.
- [ ] Sign in with a text code, text STOP and START to the BandWagon number, and check that consent updates.
- [ ] Connect a Google calendar as an org admin.
- [ ] A $1 test donation completes, and the webhook shows as paid in Admin > Support.
- [ ] `/api/health/deep` is healthy and Kuma is green.

## Later

- Ask FloMoGo to change the `flomogo.app` CNAME to `flomogo.bandwagon.club`. After that, `harrisonward.org` isn't needed for it.
- Keep the old hosts redirecting for at least a year. Paper flyers and saved texts live a long time.
- Optional: send email from an `@bandwagon.club` address in SMTP2GO (add its SPF and DKIM records) so messages match the new brand.
