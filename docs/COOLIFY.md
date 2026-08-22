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
- Use Coolify health checks against `/health/live` and `/health/ready`.
- Back up persistent PostgreSQL volumes and test restoration.
- Restrict preview/development deployments from using production Twilio/SMTP credentials.

## Health Endpoints

- `/health/live` - process is running.
- `/health/ready` - database, queue and required configuration are available.
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
