# BandWagon Interactive Demo

Live at https://demo.bandwagon.club. Fake data only. It creates no real rides and uses no Twilio, SMTP, Google Maps, Google Calendar, Microsoft Graph or production database credentials.

## Coolify

Deploy this directory as a separate application using the included Dockerfile. No environment variables are required.

## Security Headers

`nginx.conf` sends `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Strict-Transport-Security` and `Permissions-Policy` on every response.

nginx only inherits `add_header` from the server level when a location has no `add_header` of its own. Every location that sets `Cache-Control` therefore repeats all five. If you add a location with its own `add_header`, repeat them there too. `apps/web/tests/demo-nginx-headers.test.ts` fails when one is missing. Check syntax with `nginx -t` before deploying.

## Caching

- `nginx.conf` serves the page and `sw.js` with `no-cache`, and everything else for a year (`immutable`).
- CSS, JS, logo, icons and manifest are linked with `?v=2` in the source. The Docker build swaps `2` for a hash of the files, so every change gets fresh URLs automatically. Nothing to bump by hand.
- `sw.js` makes the demo installable and loads repeat visits from the device cache.
