# Cloudflare And Caching

Settings for the `bandwagon.club` zone, applied before launch (September 2026).

## Zone Settings

| Setting | Value | Why |
| --- | --- | --- |
| SSL/TLS Mode | Full | Origin (Coolify/Traefik) has its own certificate |
| Minimum TLS | 1.2 | Drops old, insecure clients |
| Always Use HTTPS | On | |
| HTTP/3 | On | Faster on phones and spotty networks |
| 0-RTT | On | Faster repeat connections |
| Early Hints | On | Browser starts fetching CSS and JS sooner |
| Tiered Cache + Smart Topology | On | Fewer trips to the origin |
| Browser Cache TTL | Respect Existing Headers | The app sets its own |
| Rocket Loader | **Off** | Breaks Next.js scripts |
| Crawler Hints | On | Tells Bing and others about changes (IndexNow) |
| DNSSEC | On | |

## Headers The App Sets

From `apps/web/next.config.ts`:

- Every page: `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `/icons/*` and `/brand/*`: `Cache-Control: public, max-age=604800, stale-while-revalidate=86400` (7 days)
- `/_next/static/*`: long-lived, handled by Next.js (file names change on every build)

**After changing a logo or icon**, purge these in Cloudflare (Caching, Configuration, Custom Purge, URL):

```text
https://bandwagon.club/brand/bimi.svg
https://bandwagon.club/icons/icon-512.png
https://bandwagon.club/icons/icon-192.png
https://bandwagon.club/icons/apple-touch-icon.png
https://bandwagon.club/bandwagon-logo.png
https://bandwagon.club/bandwagon-logo.svg
https://bandwagon.club/bandwagon-icon.svg
```

## Demo Site (demo.bandwagon.club)

The demo is a static nginx site in `demo/`. See `demo/README.md`.

- `index.html` and `sw.js`: `no-cache`, so updates show right away.
- CSS, JS, SVG, PNG and manifest: one year, `immutable`.
- The Docker build hashes the files and stamps that hash into every `?v=` link and the service worker cache name. Any change gets new URLs automatically. Nothing to bump by hand.
- `sw.js` loads the page network first and assets cache first, which also makes Install App work.
- 404s are never cached.

## Quick Check

In a browser console on the site:

```js
const r = await fetch('/icons/icon-192.png', { cache: 'no-store' });
[r.headers.get('cache-control'), r.headers.get('cf-cache-status')]
```

`HIT` means Cloudflare served it. `DYNAMIC` on pages is normal.
