# Demo Site

https://demo.bandwagon.club is a static, clickable demo of BandWagon.

## Fake Data Only

- All people, rides, and events are made up.
- It creates no real rides.
- It has no database and no secrets. It uses no Twilio, SMTP, Google Maps, Google Calendar, or Microsoft Graph credentials.
- Never add real names, phone numbers, or production data to `demo/`.

## Files

Everything lives in `demo/`:

| File | Purpose |
| --- | --- |
| `index.html` | The page |
| `app.js` | Demo behavior and fake data |
| `styles.css` | Styles |
| `sw.js` | Service worker |
| `manifest.webmanifest` | Makes it installable |
| `bandwagon-logo.svg`, `icon.svg`, `icons/*.png` | Copies of the app's brand files (see [BRANDING.md](../BRANDING.md)) |
| `nginx.conf` | Web server config |
| `Dockerfile` | Build |

## How It Is Built

The `Dockerfile`:

1. Starts from `nginx:1.27-alpine`.
2. Copies `nginx.conf` and the demo files in.
3. **Stamps a content hash.** It hashes `app.js`, `styles.css`, the logos, the manifest, and the icons. It replaces every `?v=2` in `index.html`, `sw.js`, and the manifest with `?v=<hash>`, and renames the service worker cache from `demo-v2` to `demo-<hash>`.
4. Fails the build if the hash did not land in `index.html`.
5. Adds a health check that fetches `/`.

Result: any change to a demo file gives new asset URLs. Browsers and Cloudflare fetch fresh copies. **Nothing to bump by hand.** Leave the `?v=2` placeholders in the source as they are.

## Caching (nginx.conf)

| What | Cache |
| --- | --- |
| The page (`/`, `/index.html`) | `no-cache`, always revalidates |
| `sw.js` | `no-cache`, so new versions install right away |
| CSS, JS, SVG, PNG, manifest | One year, `immutable` (safe because URLs are versioned) |
| 404s | Not cached. The long cache header is only sent on success. |

Also:

- gzip for CSS, JS, SVG, JSON, the manifest, and text.
- Security headers set at the server level: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Strict-Transport-Security`, `Permissions-Policy` (no location, camera, or microphone).
- **Known gap:** nginx does not merge `add_header` from the server block into a `location` that sets its own headers. So `Referrer-Policy`, `X-Frame-Options`, and `Permissions-Policy` are missing on `/`, `/index.html`, `/sw.js`, and the static files. Only `nosniff` and HSTS are repeated there. Fix by repeating all five headers in each location, or with an `include` file.
- `server_tokens off`.
- Unknown paths fall back to `index.html`.

## Service Worker

- Makes the demo installable as an app.
- On install it caches the page and the versioned files.
- Page loads are network first, with the cached copy used when offline.
- Other files are cache first. Their URLs change with each build, so they never go stale.
- On activate it deletes old caches.

## Deploy

- The demo is its own Coolify application, separate from the main app.
- It builds from the `Dockerfile` in `demo/`.
- Domain: `demo.bandwagon.club`, behind Cloudflare.
- No environment variables needed.
- Redeploy in Coolify after changing any demo file.

## After A Deploy

- Load https://demo.bandwagon.club and view source. The `?v=` values should be a hash, not `2`.
- Hard refresh once. The new version should show without clearing the cache.
- If the logo changed, copy the new brand files into `demo/` first.
