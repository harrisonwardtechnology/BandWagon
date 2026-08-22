# GitHub -> Coolify Deployment Checklist

This package contains the BandWagon design, deployment scaffolding, documentation and interactive FloMoGo demo. The production application backend/frontend still needs to be implemented against the master specification; the `demo/` directory is intentionally fake-data-only and can be deployed immediately.

## 1. Create the GitHub repository

Suggested repository name: `bandwagon`

Suggested description:

> Privacy-first, open-source community carpool coordination platform from Harrison Ward Technology. FloMoGo is the first BandWagon community.

From a workstation with Git installed:

```bash
git init
git branch -M main
git add .
git commit -m "Initial BandWagon platform specification and demo"
git remote add origin git@github.com:<your-account-or-org>/bandwagon.git
git push -u origin main
```

Before the first push, confirm `.env` and real secrets are not present.

## 2. GitHub repository settings

Enable:

- Public repository, when ready.
- Secret scanning and push protection where available.
- Dependabot/security alerts.
- Branch protection/ruleset for `main`.
- Pull request review for production code changes.
- GitHub Actions only after reviewing any workflow before merge.

Add repository files such as `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, and the public Trust/Privacy documentation before calling the production software generally available.

## 3. Deploy the interactive demo first

The `demo/` directory can be deployed now because it has no production database, API keys or personal information.

In Coolify:

1. Create a new Project, e.g. `BandWagon`.
2. Create an Application from the GitHub repository.
3. Select branch `main`.
4. Set Base Directory to `/demo`.
5. Use the included `demo/Dockerfile`.
6. Expose the container port specified by that Dockerfile.
7. Give it a temporary domain or a demo hostname.
8. Deploy and test all three personas.

Do not represent this static demo as the production service.

## 4. DNS for the platform

Create DNS for:

`bandwagon.harrisonward.net`

Point it to the Coolify server per your DNS provider/Coolify setup. In Coolify, add:

`https://bandwagon.harrisonward.net`

Coolify automatically handles proxy configuration and HTTPS for configured HTTPS domains.

## 5. FloMoGo domain

For `flomogo.app`, once registered:

1. In the eventual BandWagon Organization Admin UI, request `flomogo.app`.
2. Publish the generated TXT record at `_bandwagon.flomogo.app`.
3. Verify ownership in BandWagon.
4. Point `flomogo.app` to the BandWagon deployment with the DNS record appropriate to your provider.
5. Add/automate `https://flomogo.app` in Coolify.
6. Confirm HTTPS and the BandWagon domain challenge.
7. Set it as FloMoGo's primary domain.

Until the production custom-domain workflow is implemented, steps 2-6 can be performed manually using the same documented rules.

## 6. Production Coolify services

Production target:

- BandWagon application
- PostgreSQL + PostGIS
- Redis-compatible queue/cache
- Coolify reverse proxy/HTTPS
- Encrypted database backups

Do not expose PostgreSQL or Redis directly to the Internet.

## 7. Production environment variables

Copy `.env.example` into Coolify's Environment Variables screen and set real values there. Never commit `.env`.

At minimum configure:

- `APP_URL=https://bandwagon.harrisonward.net`
- `DATABASE_URL`
- `REDIS_URL`
- `AUTH_SECRET`
- `DATA_ENCRYPTION_KEY`
- SMTP settings
- support/privacy/security addresses

Then add optional integrations as they are ready:

- Twilio/RCS/SMS
- Google Maps
- Google Calendar OAuth
- Microsoft Graph Calendar OAuth
- Coolify domain API automation

## 8. Generate secrets

Examples:

```bash
openssl rand -base64 48
openssl rand -hex 32
```

Use unique values for each secret. Do not reuse passwords or tokens.

## 9. SMTP

Set the SMTP host, port, TLS mode, username/password and From address. Verify SPF, DKIM and DMARC for the sending domain before production use.

Recommended service addresses:

- `support@<domain>`
- `privacy@<domain>`
- `security@<domain>`

## 10. Twilio / RCS

Configure a Harrison Ward Technology branded RCS sender/agent and an approved SMS fallback path. Add Twilio credentials only to Coolify secrets.

Verify:

- phone opt-in flow
- welcome message
- STOP / HELP processing
- inbound action replies
- RCS button actions
- SMS fallback
- no phone number disclosure when a person selects Hidden

## 11. Google Maps

Create a restricted Maps API key. Restrict it to required APIs and approved origins. Use it for address lookup/geocoding and service-area drawing.

## 12. Google Calendar

Create OAuth credentials and use read-only calendar scopes. Set the callback URL exactly to the production callback configured in BandWagon.

## 13. Microsoft Calendar

Create the Microsoft Entra application registration and Graph calendar permissions using read-only access. Set the production redirect URI exactly.

## 14. Custom-domain automation

Start with:

`CUSTOM_DOMAIN_AUTOMATION=manual`

Once the TXT verification and Coolify integration are tested, switch to:

`CUSTOM_DOMAIN_AUTOMATION=coolify-api`

Then configure:

- `COOLIFY_API_URL`
- `COOLIFY_API_TOKEN`
- `COOLIFY_APPLICATION_UUID`

Treat the Coolify token as a high-value infrastructure secret. Prefer an operator-only domain worker or the narrowest practical Coolify team/token scope.

## 15. Bootstrap

After the production app exists and migrations complete:

1. Create the first Platform Admin using the one-time bootstrap mechanism.
2. Register FloMoGo.
3. Add a second Platform/Organization admin for continuity.
4. Configure FloMoGo branding.
5. Configure `flomogo.app`.
6. Connect calendars.
7. Configure driver/minor rules.
8. Run test rides using test accounts.
9. Review Privacy Preview and What People Can See screens.
10. Validate export/delete/block/no-show/cancellation flows.

## 16. Go-live gate

Do not invite the real community until:

- Legal review of Terms/Privacy/disclaimers is complete.
- Trust Center accurately matches the product.
- Email authentication is configured.
- Backup restore has been tested.
- Tenant-isolation tests pass.
- Blocking and parent-approval bypass tests pass.
- Calendar reconciliation has been tested after missed webhook scenarios.
- RCS/SMS STOP is tested.
- Exact address retention/deletion is tested.
- `flomogo.app` HTTPS is valid.
- Production logging has been checked for sensitive-data leakage.
