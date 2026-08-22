# BandWagon Production Web

This is the production application scaffold for BandWagon. It is intentionally separate from `/demo`.

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

## Status

This scaffold includes the production runtime shell, PWA manifest, typed environment configuration, health endpoint, database/Redis adapters, initial multi-tenant schema, hostname resolver skeleton, and authentication placeholder.

It does **not** yet implement the complete BandWagon product. Build the product iteratively against the master specification.
