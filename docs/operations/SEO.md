# Search And Discoverability (SEO)

How BandWagon shows up in search engines and AI search, and what is kept out.
Minors use BandWagon, so the rule is: **only the product site's public pages are
indexable. Nothing behind sign-in and no member data ever is.**

## What Was Built

| Piece | File | Behavior |
| --- | --- | --- |
| Rules (pure, tested) | `apps/web/src/lib/seo-policy.ts` | Public page list, private prefixes, robots rules, sitemap entries, `X-Robots-Tag`, canonical origin. |
| robots.txt | `apps/web/src/app/robots.ts` | Host aware. See below. |
| sitemap.xml | `apps/web/src/app/sitemap.ts` | Product host only. Tenants and staging get an empty sitemap. |
| Page metadata | `apps/web/src/lib/seo.ts`, `layout.tsx`, each public page | `metadataBase`, `%s \| BandWagon` titles, descriptions, per-page canonical, Open Graph and Twitter cards, manifest, icons, theme color, keywords. |
| Share image | `apps/web/src/app/opengraph-image.tsx`, `twitter-image.tsx` | 1200x630 PNG, navy `#071a33`, gold `#f5a800`, tagline. |
| Structured data | `apps/web/src/components/json-ld.tsx`, `src/lib/json-ld.ts` | Organization, WebSite, SoftwareApplication (price 0 USD) on the product home. FAQPage on `/help`. Output escapes `<`, `>`, `&`. |
| noindex header | `apps/web/src/middleware.ts` | `X-Robots-Tag: noindex, nofollow` on private paths, on every tenant page except `/`, and on all of staging. |
| Signed-in areas | `layout.tsx` in `app/`, `admin/`, `login/`, `notifications/`, `support/`, `organization-decommission/` | `robots: noindex, nofollow`. `invite/[token]` and `messaging` already/also noindex. |
| AI search | `apps/web/public/llms.txt` | Short plain description and key public URLs. |
| PWA | `apps/web/public/manifest.webmanifest` | Clearer name and description; now linked from `<head>`. |

### Product Host (bandwagon.club)

- **Indexable:** `/`, `/start`, `/help`, `/status`, `/security`, `/terms`, `/privacy`,
  `/cookies`, `/sms-opt-in`, `/legal` and its sub-pages, and `/impact/<slug>`
  for organizations whose admin turned on the public impact page.
- **Blocked in robots.txt and noindex:** `/admin`, `/api`, `/app`, `/invite`,
  `/login`, `/messaging`, `/notifications`, `/support`, `/organization-decommission`.
  (`/messaging` and `/support` stay reachable by link; they are just not in search.)

### Community (Tenant) Hosts (`<slug>.bandwagon.club`, Custom Domains)

- robots.txt allows only `/` (the landing page) and the share image and icons.
- Every other page returns `X-Robots-Tag: noindex, nofollow`.
- The landing page uses the community's own name (from its branding), has
  `robots: index, nofollow`, and a canonical on the community's issued hostname.
- There is no per-organization "hide our landing page" switch yet. The
  `organizations.discoverability` column exists (default `unlisted`) but is not
  wired to anything; it is the natural place for one if a community asks.

### Impact Pages

`/impact/<slug>` used to be `noindex` for everyone. It is now indexable **only while
the organization has the public impact page on** (same check as before:
`organization_impact_settings.public_impact_enabled=true` and an active org). It
shows aggregate totals with small-number suppression, no names or locations.
When turned off it 404s and the sitemap drops it.

### Staging

`NEXT_PUBLIC_ENVIRONMENT=staging` makes robots.txt `Disallow: /`, the sitemap
empty, every page `noindex`, and every response carry `X-Robots-Tag: noindex`.

### Canonical URLs

Canonicals and `metadataBase` come from `APP_URL` when it is a real https product
URL, otherwise the first `PLATFORM_HOSTNAMES` entry. A localhost or legacy
`harrisonward.*` value is ignored, so canonicals always say `https://bandwagon.club`.
Legacy hosts also 308 redirect page visits in middleware. There is no site-wide
canonical; each public page declares its own.

### Copy Rules

Do not claim "open source" and do not make safety guarantees. The product home
now has one `h1`, an audience section ("Who it is for"), and keeps the existing
"not a rideshare, not school transportation" notice.

## Checklist For Harrison (By Hand)

1. **Google Search Console**: add a *Domain* property for `bandwagon.club`.
   Copy the `google-site-verification=...` TXT value, add it in Cloudflare DNS as a
   TXT record on `bandwagon.club` (proxy status does not apply to TXT), then click Verify.
2. **Submit the sitemap** in Search Console: Sitemaps, enter `https://bandwagon.club/sitemap.xml`.
3. **Request indexing** with URL Inspection for `https://bandwagon.club/`,
   `/start`, and `/help`.
4. **Bing Webmaster Tools**: sign in, choose *Import from Google Search Console*
   (fastest), or add the site and verify with a Cloudflare DNS TXT/CNAME record.
   Submit the same sitemap.
5. **GitHub**: set the repository *Website* to `https://bandwagon.club`
   (repo home, gear next to *About*).
6. After deploy, spot check:
   - `https://bandwagon.club/robots.txt` lists the sitemap and the `Disallow` lines.
   - `https://<any-community>.bandwagon.club/robots.txt` shows `Allow: /$` and `Disallow: /`.
   - `https://staging.bandwagon.club/robots.txt` shows `Disallow: /`.
   - `curl -sI https://bandwagon.club/app | grep -i x-robots-tag` shows `noindex`.
   - Paste the home URL into <https://search.google.com/test/rich-results> and a
     social card validator to confirm the image and structured data.
7. Optional: remove any old `bandwagon.harrisonward.net` property in Search Console
   after the redirects have been live for a few months, or use its *Change of Address* tool
   to point it at `bandwagon.club`.
