# BandWagon High Availability

This doc covers two stages:

- **Stage 1 (this release):** several copies of the app on one Coolify server. A crashed container, a bad deploy of one copy, or a slow Twilio call no longer takes the site down or blocks users.
- **Stage 2 (plan):** a second server, so losing a whole box is survivable.

## How the app is split

It's still one Docker image. `APP_ROLE` decides what each container does.

| Role | Does | How many |
|---|---|---|
| `web` | Pages, API, webhooks. Queues notifications instead of sending them. | 2+ behind Traefik |
| `worker` | Sends notifications, runs every scheduled job, retries failures. Still answers `/api/health/*`. | 2+ |
| `all` (default) | Both, in one container. Same behavior as before this release. | 1 |
| migrate | `node scripts/migrate.mjs`, then exits | 1 per deploy |

```text
        Cloudflare Tunnel
               |
            Traefik ---- /api/health/ready check every 10s
            /     \
        web-1     web-2          (queue notifications, answer fast)
            \     /
           Postgres  <---- background_jobs table ---->  worker-1, worker-2
            Redis                                       (send, schedule, retry)
```

### The job queue (`background_jobs`)

This is the same idea as the HD tracker's `jobs` table:

- Workers **claim** ready rows with `FOR UPDATE SKIP LOCKED`, so two workers never grab the same job.
- Each claim is a **lease** (90s by default). Workers renew it every 20s while the job runs. If a worker dies, it stops renewing, and another worker picks the job up within about 90 seconds.
- A failed job **retries** with backoff: 15s, 30s, 1m, 2m, and so on, capped at 30 minutes. After `max_attempts` it becomes `dead` and stays for 30 days for troubleshooting.
- `dedupe_key` is unique. Enqueueing the same key twice is a no-op.
- Finished jobs are pruned after 7 days by the `job-queue-maintenance` task. Notification payloads (title and body) live in the table until then.

### Scheduled jobs (no more outside timers)

Every worker runs the scheduler. Each task is enqueued with the key `task:timeSlot`, so it fires once per interval no matter how many workers are running. Each task also runs under a Postgres advisory lock. A long run and a manual `POST /api/cron/*` can't overlap.

| Task | Every |
|---|---|
| ride-reminders | 15 min |
| status-monitoring | 10 min |
| organization-decommission | 30 min |
| privacy-maintenance | 60 min |
| google-calendar-sync / microsoft-calendar-sync | 60 min |
| job-queue-maintenance | 60 min |
| platform-budget | 6 h |
| safety-maintenance (credential expiry) | 12 h |

To turn tasks off, set `SCHEDULER_DISABLED_TASKS=google-calendar-sync,microsoft-calendar-sync`. The `/api/cron/*` endpoints still work, so you can remove the old Coolify scheduled tasks whenever you like.

### Notifications

With `NOTIFICATION_DELIVERY=queue`, ride actions (match, pool, driver arriving, cancel, no-show, new-ride alerts to drivers) write a job and return right away. A worker does the push, text, and email.

These still send inline on purpose, because the caller needs the result right away: sign-in codes, organization decommission confirmation codes, safety alerts, admin test sends, RouteAssist (it records whether delivery worked), and messages already sent by scheduled jobs (they already run on a worker).

Retries cover crashes, database errors, and timeouts. A single channel failing inside a send (say, one push endpoint rejects) is recorded in `notification_deliveries` and not re-sent, so nobody gets duplicate pushes.

### Other HA fixes in this release

- `scripts/migrate.mjs` takes an advisory lock. Several containers starting at once apply each migration exactly once.
- Stripe webhooks dedupe on the event id (`stripe_webhook_events`). If processing fails, the row is removed so Stripe's retry goes through.
- DoDomain webhooks use insert-on-conflict, so two instances can't both process one event.
- `/api/health/ready` reports the role and Redis status. It fails on Redis only when `HEALTH_REQUIRE_REDIS=true`.
- `/api/health/deep` has two new rows:
  - **Workers & Job Queue** is *failed* when no worker has checked in for 3 minutes while work is waiting. It's *degraded* when the oldest ready job is over 2 minutes old or anything went dead in 24h.
  - **Redis** shows whether Redis is reachable.

## Stage 1 setup on Coolify (HWTVPS01)

1. Deploy the migration PR first, with the current single container and `APP_ROLE` unset (`all`). Nothing changes yet.
2. In Coolify, create a new **Docker Compose** resource from this repo using `docker-compose.coolify.ha.yml`.
3. Copy every production variable from the current BandWagon app into it.
4. Leave the **Domains** field empty on every service. Routing comes from the Traefik labels, so `web-1` and `web-2` share one load balancer. The web router matches any hostname at the lowest priority, so the platform host, every tenant subdomain, custom domains, and the old redirecting hosts all reach it.
5. Optional: in Uptime Kuma, add a **Push** monitor with a 60s heartbeat. Put its URL in `WORKER_KUMA_PUSH_URL`.
6. Deploy. Check:
   - `/api/health/ready` returns `"role":"web"`.
   - `/api/health/deep` shows **Workers & Job Queue** as healthy.
   - Admin > Health shows each scheduled task running on schedule.
7. Stop the old single container and remove its domain.
8. Remove the old Coolify scheduled tasks that POSTed to `/api/cron/*`.

**Rollback:** start the old single container again (`APP_ROLE` unset, `NOTIFICATION_DELIVERY` unset). Queued jobs wait in the table until a worker runs, and the `all` role drains them.

> Known Coolify quirk on HWTVPS01: the Restart button doesn't actually restart containers. Use redeploy, or `docker restart` over SSH.

### Kuma monitors to add

- HTTP: `https://bandwagon.club/api/health/ready`, every 60s
- HTTP: `https://bandwagon.club/api/health/deep`, every 5 min (returns 503 when anything has failed, including "no live worker")
- Push: `WORKER_KUMA_PUSH_URL`, heartbeat 60s

## Stage 2: a second server

Stage 1 keeps the site up when a container dies. It doesn't help if HWTVPS01 itself goes down, and Postgres is still one container. Here's the order that buys the most for the least work.

### Step 1: Backups you've actually restored (do this first)

- Nightly `pg_dump` to Cloudflare R2. That's already the pattern for the Coolify backups.
- Monthly: `npm run ops:verify-backup-restore` against the latest dump. That's already a launch checklist item.
- This sets your worst case to "lose up to a day." Everything below shrinks that.

### Step 2: Postgres off the app server

Postgres is the single point of failure that matters. Pick one of these:

| Option | Failover | Effort | Notes |
|---|---|---|---|
| **Managed Postgres with HA** (IONOS DBaaS PostgreSQL, or another provider) | Automatic, about 1 min | Low | **Confirm PostGIS is supported before choosing.** BandWagon needs it. You'll need `DATABASE_SSL=true`. |
| **Primary on server 1 + streaming replica on server 2** | Manual promote, about 15 min | Medium | Runbook: promote the replica, change `DATABASE_URL`, redeploy. Loses only a few seconds of data. |
| Patroni / pg_auto_failover cluster | Automatic | High | Needs 3 nodes for a proper quorum. Overkill at pilot scale. |

My recommendation: managed, if PostGIS is available. Otherwise primary + replica with a written promote runbook.

### Step 3: Second app server

1. Add a second server in Coolify (for example `HWTVPS02`, ideally in a different IONOS data center).
2. Deploy the same compose file there with `web` and `worker` only (no migrate). Point it at the same Postgres and Redis. The job queue and scheduler already work safely across servers, since they coordinate through Postgres and not the local box.
3. Traffic between the two servers:
   - **Easiest:** run a second `cloudflared` connector for the same Cloudflare Tunnel on server 2. Cloudflare load-balances between connectors and stops sending to one that disconnects. This fits your current tunnel setup.
   - **More control:** Cloudflare Load Balancing with health checks on `/api/health/ready`. It's a paid add-on.

### Step 4: Redis

Redis holds only short-lived data: rate-limit counters, webhook dedupe keys, and a consent mirror. Losing it loses nothing permanent. Options:

- Keep one Redis and leave `HEALTH_REQUIRE_REDIS=false`. If it dies, limits fail open and deep health alerts. This is fine for the pilot.
- Managed Redis or Valkey with a replica. After that, set `HEALTH_REQUIRE_REDIS=true`.
- Redis Sentinel across 3 nodes. It's the most work.

### Stage 2 at a glance

```text
            Cloudflare Tunnel (2 connectors)
               /                      \
      HWTVPS01                        HWTVPS02
   web x2, worker x2              web x2, worker x2
               \                      /
          Managed Postgres (HA, PostGIS)  +  Redis
                         |
                  nightly dump -> R2
```

## Env reference

| Variable | Default | Meaning |
|---|---|---|
| `APP_ROLE` | `all` | `web`, `worker`, or `all` |
| `NOTIFICATION_DELIVERY` | `inline` | `queue` hands ride notifications to workers |
| `WORKER_CONCURRENCY` | `4` | Jobs one worker runs at once (max 20) |
| `WORKER_POLL_MS` | `1000` | Idle poll interval |
| `WORKER_LEASE_SECONDS` | `90` | How long before a dead worker's job is retaken |
| `WORKER_SHUTDOWN_GRACE_MS` | `20000` | Time running jobs get to finish on redeploy |
| `WORKER_KUMA_PUSH_URL` | unset | Uptime Kuma push monitor |
| `SCHEDULER_DISABLED_TASKS` | unset | Comma-separated task keys to skip |
| `HEALTH_REQUIRE_REDIS` | `false` | Fail readiness when Redis is down |
