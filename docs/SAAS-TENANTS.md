# BandWagon SaaS Tenant Model

BandWagon is a multi-tenant SaaS platform.

## Domain model

Platform/admin:

`bandwagon.harrisonward.net`

Default tenant URLs:

`{tenant}.harrisonward.org`

Examples:

- `flomogo.harrisonward.org`
- `exampleband.harrisonward.org`
- `troop123.harrisonward.org`

Optional customer custom hostname:

`rides.customer.org`

Customer DNS:

`CNAME rides.customer.org -> exampleband.harrisonward.org`

## Why HarrisonWard.org

The root domain is dedicated to tenant routing, so every tenant stays exactly one DNS level deep and can be covered by a normal wildcard:

`*.harrisonward.org`

No nested `tenant.bandwagon.harrisonward.net` hostnames are required.

## Required DNS / Coolify setup

Create a wildcard DNS record for HarrisonWard.org that points all tenant hostnames at the BandWagon application/proxy.

Recommended Cloudflare record:

- Type: CNAME (or A/AAAA depending the current Coolify ingress design)
- Name: `*`
- Target: the same ingress target used for BandWagon
- Proxy: enabled when appropriate for the current Cloudflare/Coolify architecture

The application resolves the incoming `Host` only against active `organization_domains` rows. An arbitrary Host header cannot select a tenant.

## FloMoGo

Migration `006_saas_tenants.sql` creates/updates FloMoGo as tenant #1:

- slug: `flomogo`
- default tenant hostname: `flomogo.harrisonward.org`
- custom domain planned: `flomogo.app`

## Custom domains

The admin console is:

`/admin/tenants`

The administrator chooses an organization and custom hostname. BandWagon returns the exact CNAME target.

Without Cloudflare for SaaS API configuration, BandWagon can still verify that the customer CNAME points to the tenant hostname, but production certificate/custom-hostname onboarding must be handled externally.

With Cloudflare for SaaS configured, BandWagon can request the custom hostname automatically.

Optional runtime variables:

- `TENANT_BASE_DOMAIN=harrisonward.org`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_SAAS_ZONE_ID`

The API token should be narrowly scoped to the SaaS zone/custom-hostname actions required by BandWagon.

## Tenant lifecycle

1. Create organization.
2. BandWagon assigns `{slug}.harrisonward.org` immediately.
3. Organization configures branding, calendars, users, notification settings, and rides.
4. Organization optionally requests a custom hostname.
5. BandWagon displays the required CNAME.
6. DNS and SSL are verified.
7. Custom hostname may be promoted to primary while the HarrisonWard.org hostname remains a fallback.

## Security boundary

Tenant resolution occurs only after a database lookup against an active domain and active organization. Never derive tenant authorization from the hostname string alone.
