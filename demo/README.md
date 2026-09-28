# BandWagon Interactive Demo

Live at https://demo.bandwagon.club. Fake data only. It creates no real rides and uses no Twilio, SMTP, Google Maps, Google Calendar, Microsoft Graph or production database credentials.

## Coolify

Deploy this directory as a separate application using the included Dockerfile. No environment variables are required.

## Caching

- `nginx.conf` serves the page and `sw.js` with `no-cache`, and everything else for a year (`immutable`).
- CSS, JS, logo, icons and manifest are linked with `?v=N`. When you change any of them, bump `?v=` in `index.html` and `VERSION` / `SHELL` in `sw.js`.
- `sw.js` makes the demo installable and loads repeat visits from the device cache.
