# Next Coolify Steps After Push

1. Create a second Coolify Application in the existing BandWagon project.
2. Select the public Git repo `https://github.com/harrisonwardtechnology/BandWagon`.
3. Branch: `main`.
4. Build pack: Dockerfile.
5. Base directory: `/apps/web`.
6. Container/exposed port: `3000`.
7. Domain: `https://bandwagon.harrisonward.net`.
8. Because traffic comes through the existing Cloudflare Tunnel wildcard `*.harrisonward.net -> http://localhost:80`, disable Coolify's HTTP-to-HTTPS redirect for this application.
9. Add initial environment variables:
   - `NODE_ENV=production`
   - `APP_NAME=BandWagon`
   - `APP_TAGLINE=Community-powered rides.`
   - `APP_URL=https://bandwagon.harrisonward.net`
   - `PLATFORM_VENDOR_NAME=Harrison Ward Technology`
   - `PLATFORM_VENDOR_URL=https://harrisonward.com`
   - `DEFAULT_TIMEZONE=America/Chicago`
   - `DATABASE_SSL=false`
   - `HEALTH_REQUIRE_DATABASE=false`
   - `HEALTH_REQUIRE_REDIS=false`
10. Deploy.
11. Confirm `https://bandwagon.harrisonward.net/api/health` returns `status: ok`.
12. Then create PostGIS and Redis resources and wire them in.
