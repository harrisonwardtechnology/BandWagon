# Coolify Deployment Guide

## Recommended Production Shape

- Application container
- PostgreSQL + PostGIS
- Redis-compatible service for queues, rate limits, ephemeral tokens, and job coordination
- Coolify-managed HTTPS/reverse proxy
- Persistent database volumes and encrypted backups

## Setup

1. Create a GitHub repository from the project.
2. In Coolify, create a new application/service linked to the repository.
3. Add PostgreSQL/PostGIS and Redis services.
4. Copy `.env.example` values into Coolify Environment Variables. Never commit `.env`.
5. Generate strong `AUTH_SECRET` and `DATA_ENCRYPTION_KEY` values.
6. Configure SMTP, Twilio, Google Maps, Google Calendar OAuth, and Microsoft Graph OAuth as needed.
7. Set `APP_URL` to the final HTTPS public URL before configuring OAuth redirect URIs.
8. Deploy.
9. Run database migrations.
10. Bootstrap the first Platform Admin through a documented one-time CLI/bootstrap action.
11. Confirm the Configuration Health screen is green before inviting organizations.

## Coolify Notes

- Mark secret environment variables as secret/sensitive where supported.
- Do not expose PostgreSQL or Redis publicly.
- Use Coolify health checks against `/api/health/live` and `/api/health/ready`.
- For multiple web/worker instances, see [operations/HIGH-AVAILABILITY.md](operations/HIGH-AVAILABILITY.md).
- Back up persistent PostgreSQL volumes and test restoration.
- Restrict preview/development deployments from using production Twilio/SMTP credentials.

## Optional Public Links and Domain Settings

| Variable | Example | Notes |
|---|---|---|
| `NEXT_PUBLIC_HELP_DESK_URL` | `https://help.harrisonward.net` | Help desk portal (FreeScout). Support links use it and keep email as a fallback. Build-time value: mark it as a build variable. |
| `NEXT_PUBLIC_STATUS_PAGE_URL` | your Uptime Kuma status page | Shown on `/status` when set. `/status` always shows a live readiness check. Build-time value. (`NEXT_PUBLIC_STATUS_URL` is still read as a fallback.) |
| `NEXT_PUBLIC_ENVIRONMENT` | `production` or `staging` | `staging` shows a red banner and forces the messaging sandbox on. Build-time and runtime. |
| `MESSAGING_SANDBOX` | `false` | `true` sends SMS and email only to `SANDBOX_ALLOWED_PHONES` and `SANDBOX_ALLOWED_EMAILS`. Never true in production; the readiness check fails if it is. |
| `PLATFORM_HOSTNAMES` | `bandwagon.club,www.bandwagon.club` | Product-site hostnames, primary first. |
| `TENANT_BASE_DOMAIN` | `bandwagon.club` | Parent domain for new tenant hostnames. |

For a staging copy, see [operations/STAGING.md](operations/STAGING.md). To move domains, see [operations/CHANGING-TENANT-DOMAIN.md](operations/CHANGING-TENANT-DOMAIN.md).

## Health Endpoints

- `/api/health/live` - process is running.
- `/api/health/ready` - database, encryption key, and (if `HEALTH_REQUIRE_REDIS=true`) Redis are available. Reports the instance's `APP_ROLE`.
- `/api/health/deep` - integrations, scheduled jobs, workers and the job queue; 503 when anything has failed.
- `/admin/config-health` - authenticated Platform Admin page showing status only, never secret values.

Example safe health display:

- Database: Connected
- Queue: Connected
- SMTP: Configured
- Twilio: Configured
- Google Calendar: Enabled
- Microsoft Calendar: Enabled
- Google Maps: Configured
- Encryption: Configured
- Background Jobs: Healthy
- Last Calendar Reconciliation: 7 minutes ago

## Automated Organization Domains

BandWagon custom domains are verified by DNS TXT before routing is changed. For initial deployment, use `CUSTOM_DOMAIN_AUTOMATION=manual`.

When API automation is enabled, BandWagon may call Coolify's application update API to append a verified HTTPS hostname to the application's domain list. Never automatically force through a Coolify domain conflict. Treat `COOLIFY_API_TOKEN` as an infrastructure-level secret and keep it out of GitHub and application logs.

See `CUSTOM-DOMAINS.md` for the complete verification and activation lifecycle.
