# Branding

## Brand Hierarchy

1. **Harrison Ward Technology**: developer, maintainer, and service operator.
2. **BandWagon**: open-source community ride-coordination platform.
3. **FloMoGo**: Flower Mound community service powered by BandWagon.

Default platform URL: `bandwagon.club`. Communities live at `<slug>.bandwagon.club`. FloMoGo's default host is moving from `flomogo.harrisonward.org` to `flomogo.bandwagon.club` (see [V1 Launch Checklist](operations/V1-LAUNCH-CHECKLIST.md)). Its custom domain `flomogo.app` stays as is.

## The Logo: Route To The Show

- A dotted white route runs from a gold start circle to a gold music note.
- Background is a navy rounded square.
- The idea: a ride from home to the show.

| Color | Hex | Use |
| --- | --- | --- |
| Navy | `#071a33` | Background, "Band" in the wordmark |
| Gold | `#f5a800` | Start circle, music note, "Wagon" in the wordmark |
| White | `#ffffff` | Dotted route |

The wordmark is one `<text>` element with two `<tspan>`s ("Band" navy, "Wagon" gold). Keep it as one text element. Two separate text elements leave a gap between the words in some renderers.

The old generic "Bw" letter mark is retired. Do not use it anywhere. Google rejected it as not unique (see [Google OAuth Verification](operations/GOOGLE-OAUTH-VERIFICATION.md)).

## Brand Assets In The Repo

All paths are under `apps/web/public/` unless noted.

| File | Size | Used For |
| --- | --- | --- |
| `bandwagon-icon.svg` | 512x512 | Favicon (SVG), compact logo in `BrandLogo`, source art for the share card |
| `bandwagon-logo.svg` | 980x240 | Full wordmark in `BrandLogo` (site header) |
| `bandwagon-logo.png` | 980x240 | Stripe checkout branding (`lib/stripe-support.ts`). Stripe needs a PNG. |
| `icons/icon-192.png` | 192x192 | PWA icon (maskable), PNG favicon, push notification icon and badge |
| `icons/icon-512.png` | 512x512 | PWA icon (maskable), JSON-LD `LOGO_URL` for search engines |
| `icons/apple-touch-icon.png` | 180x180 | iOS home screen icon |
| `brand/bimi.svg` | 512x512 | BIMI email logo. SVG Tiny PS, square, no rounded corners. |
| `brand/google-oauth-logo-120.png` | 120x120 | Google sign-in consent screen logo |
| `brand/rcs-logo-224.png` | 224x224 | Twilio RCS sender logo (public URL) |
| `brand/rcs-banner-1440x448.png` | 1440x448 | Twilio RCS sender banner (public URL) |
| `social/bandwagon-social.png` | 1200x630 | Image at the top of the repo README |

Also:

- **Share card**: `apps/web/src/components/og-card.tsx` draws the Open Graph and Twitter/X image at build time. It has the icon inlined as base64, so it renders offline. Used by `app/opengraph-image.tsx` and `app/twitter-image.tsx`.
- **Demo copies**: `demo/bandwagon-logo.svg`, `demo/icon.svg`, and `demo/icons/*.png` are exact copies of the files above. Copy them again when the logo changes.

Rules for the icon files:

- Maskable icons keep the art inside the center safe zone (about 80% of the square) so Android can crop to a circle.
- BIMI must stay SVG Tiny PS with a `<title>`, no scripts, no external links, and a square shape.

## Uploaded By Hand

These places hold a copy of the logo that was uploaded manually. They do not update from the repo.

- Google Auth Platform > Branding (uses `brand/google-oauth-logo-120.png`)
- Uptime Kuma status page (https://status.bandwagon.club)
- Coolify project icon
- Azure app registration (Microsoft integration)
- Twilio RCS sender profile (logo and banner URLs)
- DoDomain

## If The Logo Changes

1. Update every file in the repo table above, the share card, and the demo copies.
2. Re-upload to every place in the "Uploaded By Hand" list.
3. Purge Cloudflare cache for `/brand/*` and `/icons/*`. `next.config.ts` caches them for 7 days.
4. Changing the Google logo restarts Google brand verification. Changing the RCS logo needs Twilio and carrier review again.
5. Redeploy the demo so its content hash changes.

## Tenant Branding

Organizations may customize name, logo, icon, tagline, welcome text, visual theme, and a verified custom domain. They may not remove the independent-third-party disclosure or the BandWagon / Harrison Ward Technology operator attribution.

Text, RCS, and email content should name the community clearly, for example `FloMoGo: Ride Reminder`. The provider or carrier business identity may be Harrison Ward Technology.

## Editing Tenant Branding

- Org owners and admins edit branding at `/admin/branding`. Managers can view it.
- Fields: community name, who it's for, tagline, welcome message, logo link, and button color.
- Logo links must be `https://`. No `javascript:`, `data:`, credentials, or single-label hosts.
- Button colors must keep 4.5:1 contrast with the dark navy button text.
- Saved values live in `organizations.display_name` and `organizations.branding`.
- Every change is audited.
- The tenant homepage renders them with safe defaults.
- The independent-platform notice and BandWagon / Harrison Ward Technology attribution are not editable.
