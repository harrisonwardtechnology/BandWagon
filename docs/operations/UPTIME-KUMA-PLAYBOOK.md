# BandWagon Uptime Kuma Monitoring Playbook

Purpose: provide an external monitoring layer for BandWagon, a branded public status page, and a simple operational playbook for troubleshooting outages.

## Architecture

Recommended topology:

```text
Internet
  |
  +-- BandWagon / FloMoGo
  |     |
  |     +-- Coolify / app container
  |     +-- PostgreSQL / Redis / integrations
  |
  +-- Uptime Kuma (separate host preferred)
        |
        +-- private operator dashboard
        +-- public BandWagon status page
```

Run Uptime Kuma outside the BandWagon application host when possible. If the BandWagon server, Coolify host, network, or hypervisor fails, the monitoring service should remain available to detect and publish the outage.

Use a local Docker volume for `/app/data`. Do not place the Uptime Kuma data directory on NFS or another filesystem that does not reliably support POSIX file locks.

## Recommended Names and Domains

Use names that are easy for users to understand and do not reveal unnecessary infrastructure details.

Recommended:

- Private Kuma admin: `monitor.harrisonward.org`
- Public status page: `status.harrisonward.org`
- Status page title: `BandWagon Status`
- Tagline / description: `Current availability for BandWagon community ride services.`

If different domains are selected, keep the operator dashboard protected and the public status page intentionally public.

## Deploy Uptime Kuma

Current recommended container image:

```text
louislam/uptime-kuma:2
```

Container port:

```text
3001
```

Persistent volume:

```text
uptime-kuma:/app/data
```

Minimum Docker configuration:

```yaml
services:
  uptime-kuma:
    image: louislam/uptime-kuma:2
    restart: unless-stopped
    ports:
      - "3001:3001"
    volumes:
      - uptime-kuma:/app/data

volumes:
  uptime-kuma:
```

### Coolify

1. Create a new Docker / Compose service for Uptime Kuma.
2. Attach persistent local storage to `/app/data`.
3. Expose port `3001` through Coolify's proxy.
4. Add the private operator hostname.
5. Add the public status hostname to the same Kuma service.
6. Put the operator hostname behind Cloudflare Access or another identity-aware access layer if available.
7. Do **not** put the public status page behind an authentication wall.
8. Back up the `/app/data` volume on the same cadence as other operational tooling.

## First-Run Security

Immediately after first login:

1. Create the named administrator account.
2. Use a unique password stored in the organization password manager.
3. Enable Uptime Kuma 2FA.
4. Configure the Primary Base URL.
5. Configure at least two notification paths where practical.
6. Do not publish the administrative dashboard URL as the public status URL.

## BandWagon Health Endpoints

BandWagon exposes three health levels.

### Liveness

```text
GET https://bandwagon.harrisonward.net/api/health/live
```

Purpose: confirms the web process is alive.

Use for low-level troubleshooting. A successful liveness response does **not** mean the application is fully usable.

### Readiness

```text
GET https://bandwagon.harrisonward.net/api/health/ready
```

Purpose: confirms BandWagon is ready to serve core application traffic.

This is the primary uptime / SLA monitor and the same endpoint used by the BandWagon Docker health check. It returns HTTP `503` when core readiness fails.

### Deep Health

```text
GET https://bandwagon.harrisonward.net/api/health/deep
```

Purpose: operator-level health summary for integrations and scheduled services.

Use this as a private monitor. Do not expose its technical detail on the public status page.

For Uptime Kuma v2, use an **HTTP(s) - JSON Query** monitor when you want a degraded state to alert even though the endpoint still returns HTTP 200:

```text
JSON Query Expression: status
Expected Value: healthy
```

## Recommended Monitor Set

| Monitor | Type | Target | Interval | Retries | Public? | Purpose |
|---|---|---|---:|---:|---|---|
| BandWagon Core Readiness | HTTP(s) | `/api/health/ready` | 60 sec | 2 | Yes | Primary platform uptime |
| BandWagon Liveness | HTTP(s) | `/api/health/live` | 30 sec | 2 | No | Process-level troubleshooting |
| BandWagon Deep Health | HTTP(s) JSON Query | `/api/health/deep` | 300 sec | 2 | No | Integration / cron degradation |
| BandWagon Web Experience | HTTP(s) Keyword | `https://bandwagon.harrisonward.net/` | 60 sec | 2 | Yes | Confirms the public application renders |
| FloMoGo Web Experience | HTTP(s) Keyword | `https://flomogo.app/` | 60 sec | 2 | Yes | First production community availability |

For the keyword monitors, use stable product text such as `BandWagon` or `FloMoGo`, not transient page copy.

### Certificate Monitoring

Enable HTTPS certificate monitoring / expiry notification on public HTTPS monitors. Certificate issues should alert operators before expiration but should not be shown as a separate public component unless an outage actually affects users.

## What NOT to Monitor Directly

Do not give Uptime Kuma production API credentials for Google Maps, Twilio, LiteLLM, S3, or other providers just to run synthetic checks.

BandWagon Platform Health already observes those integrations from inside the application. Kuma should monitor BandWagon's health contracts, while BandWagon diagnoses the underlying provider.

This avoids:

- duplicating secrets into another system
- generating unnecessary paid API calls
- exposing vendor architecture on the public status page
- false restarts / alerts when an optional provider is degraded but BandWagon can safely fall back

## Public Status Page

Create a status page with slug:

```text
bandwagon
```

Recommended public hostname:

```text
status.harrisonward.org
```

Add the hostname to the Uptime Kuma status page's domain list so the domain opens the status page directly.

### Public Component Groups

Keep names user-friendly.

#### BandWagon Platform

- BandWagon Core Readiness
- BandWagon Web Experience

#### Communities

- FloMoGo

As the platform grows, optionally add high-level components such as:

- Ride Coordination
- Account & Sign-In
- Notifications
- RouteAssist

Only publish a component when the monitor represents something users can understand. Do not publish PostgreSQL, Redis, S3 bucket names, LiteLLM, Twilio account details, or server names.

## Status Page Branding

### Logo

Use the BandWagon icon from:

```text
apps/web/public/bandwagon-icon.svg
```

Uptime Kuma supports uploading a status-page logo. Export or upload a clean square PNG if the Uptime Kuma image uploader requires a raster image.

### Title

```text
BandWagon Status
```

### Footer

Recommended footer copy:

```text
BandWagon is a privacy-first community ride coordination platform maintained by Harrison Ward Technology.
```

### Theme

Use the light theme as the base and apply the BandWagon custom CSS from:

```text
config/uptime-kuma-bandwagon-status.css
```

Paste that file into:

```text
Status Page -> Edit -> Custom CSS
```

The stylesheet intentionally uses conservative selectors so Uptime Kuma upgrades fail gracefully rather than making the status page unusable.

### Core Brand Values Used

```text
Navy:   #101b33
Slate:  #64748b
Border: #e2e8f0
BG:     #f8fafc
Green:  #16a34a
Amber:  #d97706
Red:    #dc2626
```

## Notifications

Configure operator alerts separately from public status incidents.

Recommended operational behavior:

- Core Readiness DOWN: immediate notification
- Public Website DOWN: immediate notification
- Deep Health degraded: operator notification, not necessarily a public incident
- Certificate expiration warning: operator notification
- Recovery: notify the same destination that received the outage

Avoid SMS for routine monitor noise when Push / email / chat notification is available. Reserve SMS for truly critical cases if desired.

## Alert Noise Guardrails

Recommended defaults:

- Production readiness retries: 2
- Web experience retries: 2
- Deep-health retries: 2
- Do not alert on one isolated slow request
- Do alert if core readiness fails repeatedly
- Use maintenance windows during planned releases when appropriate

The goal is fast detection without training operators to ignore alerts.

## Incident Workflow

When Kuma reports an outage:

1. Open the private Uptime Kuma monitor and confirm which external check failed.
2. Check Coolify container health.
3. Open BandWagon Platform Health.
4. Check the relevant integration / cron / organization health detail.
5. If user impact is confirmed, publish an Uptime Kuma status-page incident.
6. Use plain-language incident text. Do not expose secrets, internal hostnames, database names, tokens, or unnecessary provider details.
7. Update the incident as material facts change.
8. Resolve the incident only after the external Kuma monitor and BandWagon internal health agree that service is restored.
9. For meaningful incidents, record a short internal post-incident note.

### Example Public Incident

```text
Investigating delayed ride notifications

We are investigating delays affecting some BandWagon ride notifications. Ride coordination remains available. We will post another update when delivery is operating normally.
```

Prefer user impact over vendor blame.

## Maintenance Workflow

Before planned production maintenance:

1. Create a maintenance window in Uptime Kuma for affected monitors.
2. If users could notice disruption, publish a maintenance notice on the public status page.
3. Perform the deployment / maintenance.
4. Confirm `/api/health/ready` is healthy.
5. Confirm `/api/health/deep` is healthy or only shows an understood non-blocking degradation.
6. Confirm FloMoGo and BandWagon public pages load.
7. End maintenance.

## Backup and Recovery

Uptime Kuma is operational infrastructure. Back it up.

Back up:

```text
/app/data
```

Minimum recovery test:

1. Start a fresh Uptime Kuma container of the same major version.
2. Restore `/app/data` from backup.
3. Confirm monitors, notification settings, status page, and branding are present.
4. Confirm public status hostname resolves correctly.

Do not wait for an outage to discover that the monitoring system itself cannot be restored.

## Validation Checklist

After setup, test all of the following:

- [ ] Uptime Kuma is running on infrastructure independent of BandWagon where practical
- [ ] `/app/data` uses persistent local storage
- [ ] Admin account has 2FA enabled
- [ ] Operator/admin hostname is access-controlled
- [ ] Public status hostname is reachable without login
- [ ] BandWagon Core Readiness monitor is green
- [ ] BandWagon Liveness monitor is green
- [ ] BandWagon Deep Health monitor is green
- [ ] BandWagon public web monitor is green
- [ ] FloMoGo public web monitor is green
- [ ] SSL expiry monitoring is enabled
- [ ] Notification test succeeds
- [ ] Status page uses BandWagon logo and branding CSS
- [ ] Test incident appears correctly on the public page
- [ ] Test maintenance window suppresses expected alerts
- [ ] Uptime Kuma data is included in backups

## Relationship to BandWagon Platform Health

These systems have different jobs:

```text
Coolify health
  = Should this BandWagon container receive traffic?

Uptime Kuma
  = Can an external observer reach BandWagon, and should operators/users be notified?

BandWagon Platform Health
  = What inside BandWagon is unhealthy and why?
```

Use all three together. That creates a clean troubleshooting chain from external symptom -> application readiness -> internal root-cause evidence.
