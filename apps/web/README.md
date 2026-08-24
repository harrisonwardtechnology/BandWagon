# BandWagon Production Web

This is the production BandWagon application. It is intentionally separate from the fake-data-only `/demo` walkthrough at the repository root.

## First deployment

The scaffold can boot before PostgreSQL/Redis are configured. This is deliberate so the web container and routing can be proven first.

In Coolify:

- Base directory: `/apps/web`
- Build pack: Dockerfile
- Container port: `3000`
- Domain: `https://bandwagon.harrisonward.net`
- When behind the existing Cloudflare Tunnel, keep Coolify HTTP-to-HTTPS redirect disabled.

Start with only the Core environment values from `.env.example`. Leave `HEALTH_REQUIRE_DATABASE=false` and `HEALTH_REQUIRE_REDIS=false` until the services exist.

Then add Postgres/PostGIS and Redis, set their URLs, run `npm run db:migrate`, verify `/api/health`, and change both health requirement flags to `true`.

## Release verification

From this directory:

```bash
npm ci
npm run db:migrate
npm run db:verify
npm test
npm run typecheck
npm run build
npm run release:check-env:flomogo
```

The environment check reports missing controls without printing configured values. Use `release:check-env` for a core production deployment while optional/external integrations are unavailable; only the `flomogo` profile is sufficient for the v1 launch.

See the repository [v1 launch checklist](../../docs/operations/V1-LAUNCH-CHECKLIST.md) for production evidence and human safety drills that cannot be proven by a build.
