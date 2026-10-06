# Branding

## Brand Hierarchy

1. **Harrison Ward Technology**: developer, maintainer and service operator.
2. **BandWagon**: open-source community ride coordination platform.
3. **FloMoGo**: Flower Mound community service powered by BandWagon.

Default platform URL: `bandwagon.club`. FloMoGo primary URL: `flomogo.app`.

## The Logo

The mark is **Route To The Show**: a dotted route from a gold start point to a gold music note, on navy. It replaced the old circular "Bw" letter mark in September 2026 (PR #46).

| Token | Value |
| --- | --- |
| Navy | `#071a33` |
| Gold | `#f5a800` |
| White | `#ffffff` |
| Cream (light backgrounds) | `#fffaf0` |
| Wordmark font | Arial Black on the site, Poppins Bold in rendered PNGs |

The wordmark is one text run (`Band` navy, `Wagon` gold) so it never splits into "Band Wagon" when a font is missing.

## Logo Files

| File | Size | Used By |
| --- | --- | --- |
| `apps/web/public/bandwagon-icon.svg` | 512, rounded | Favicon, compact header logo |
| `apps/web/public/bandwagon-logo.svg` / `.png` | 980x240 | Header wordmark; the PNG is Stripe checkout branding |
| `apps/web/public/bandwagon-logo-dark.svg` | 980x240 | Header wordmark in dark mode ("Band" in white, thin light edge on the tile) |
| `apps/web/public/icons/icon-192.png`, `icon-512.png` | Full bleed, maskable safe zone | PWA install (`maskable`), push notifications, JSON-LD logo |
| `apps/web/public/icons/icon-any-192.png`, `icon-any-512.png` | Rounded, transparent corners | PWA install (`any`), for launchers that do not mask icons |
| `apps/web/public/icons/apple-touch-icon.png` | 180 | iPhone home screen |
| `apps/web/public/brand/google-oauth-logo-120.png` | 120 | Google sign-in consent screen |
| `apps/web/public/brand/rcs-logo-224.png` | 224, under 50 KB | Twilio RCS sender logo (shown as a circle) |
| `apps/web/public/brand/rcs-banner-1440x448.png` | 1440x448, under 200 KB | Twilio RCS banner (Android only; keep bottom middle clear) |
| `apps/web/public/brand/bimi.svg` | SVG Tiny PS | BIMI inbox logo (see `operations/EMAIL-DOMAIN.md`) |
| `apps/web/public/social/bandwagon-social.png` | 1200x630 | README image |
| `src/components/og-card.tsx` | 1200x630 | Share card (Open Graph and Twitter) with the mark inlined |
| `demo/icon.svg`, `demo/icons/*` | Same art | Demo site favicon and PWA icons |

## Places Outside The Repo That Show The Logo

Update all of these when the logo changes:

- Google Auth Platform, Branding (120x120 PNG, must match the homepage)
- Twilio RCS sender profile (logo and banner URLs above)
- Uptime Kuma status page (status.bandwagon.club)
- Coolify project icon (Projects, BandWagon, Settings)
- Azure app registration branding (Microsoft sign-in)
- DoDomain branding
- Cloudflare: purge `/brand/*`, `/icons/*` and the logo files after a change, since `/brand` and `/icons` are cached for 7 days

## Theme And Dark Mode

BandWagon follows the device setting. There is no in-app switch.

- **Tokens live in one place:** `apps/web/src/app/globals.css`. `:root` holds the light values and `@media (prefers-color-scheme: dark)` holds the dark ones.
- **Pages never hard-code neutral colors.** Inline styles use `var(--surface)`, `var(--text)`, `var(--line)` and friends. `tests/theme-tokens.test.ts` fails the build on an old fixed gray, white card or navy block.
- **Brand colors do not change:** navy `#071a33`, gold `#f5a800`, cream `#fffaf0`.
- **Font:** the device's own system font. No web font is loaded.
- **Icons:** [Lucide](https://lucide.dev) (`lucide-react`), with `className="icon"` so they take the text size and color.

| Token | Light | Dark | Used For |
| --- | --- | --- | --- |
| `--bg` | `#f7f8fb` | `#0b1422` | Page background |
| `--surface`, `--surface-2`, `--surface-3`, `--surface-4` | White to `#e2e8f0` | `#121e31` to `#2a3b55` | Cards, quiet panels, chips, progress tracks |
| `--text`, `--text-2`, `--text-3`, `--text-muted`, `--text-faint` | Navy to gray | Near white to gray | Headings down to hints |
| `--line`, `--line-soft`, `--line-2`, `--line-strong`, `--line-solid` | Light grays, navy | Dark blues, near white | Borders and dividers |
| `--btn-solid` / `--on-btn-solid` | Navy / white | Gold / navy | Main buttons, active tab, progress fill |
| `--panel-solid` | Navy | Lighter navy `#15294a` | Page banners and toasts (white text in both) |
| `--bg-warn`, `--bg-danger`, `--bg-info`, `--bg-success` (and `--text-*`, `--line-*`) | Pale tints | Deep tints | Notices and status |

Things that stay fixed on purpose:

- **Pickup check card** (`/app/rides/verify`). The driver and the family compare the same color on two phones, so it looks the same in light and dark.
- **Solid status buttons** (red delete, blue links, green approve) with white text.
- **Share cards and emails**, which are rendered as images or sent to mail apps.
- **A community's button color** from the branding editor. It is checked against navy text, which is what buttons use in dark mode.

Other rules the shell enforces: buttons, fields and menu links are at least 44 points tall, `prefers-reduced-motion` turns off animation, and focus rings are gold in both themes.

## Community Branding

Organizations may customize name, logo, icon, tagline, welcome text, visual theme and a verified custom domain. They may not remove the independent third party disclosure or the required BandWagon / Harrison Ward Technology attribution.

RCS, SMS and email content should name the community clearly, for example `FloMoGo - Ride Reminder`, while the carrier business identity may be Harrison Ward Technology.

## Editing Community Branding

Org owners and admins edit branding at `/admin/branding`: community name, who it's for, tagline, welcome message, logo link (https only), and button color. Managers can view it. Button colors must keep 4.5:1 contrast with the dark navy button text. Saved values live in `organizations.display_name` and `organizations.branding`, every change is audited, and the tenant homepage renders them with safe defaults. The independent platform notice and BandWagon / Harrison Ward Technology attribution are not editable.

## UI Text Style

Buttons, headings, labels and page titles use Title Case with every word capitalized ("Start A Free Community", "Terms Of Use"). `apps/web/tests/title-case-ui.test.ts` guards this.
