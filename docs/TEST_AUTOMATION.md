# BandWagon test automation

## Pull requests and main

`Web Build` applies every migration twice, verifies the schema, runs unit and type checks, builds the production server, and then runs:

- A Playwright role workflow: organizer-created event, parent request, driver offer, parent acceptance, and driver completion.
- An authorization assertion proving a regular member cannot create organizer events.
- Cron and deep-health smoke checks.
- A 300-request load smoke.

Failed Playwright runs retain traces, screenshots, and an HTML report for 14 days.

## Production synthetic

Set the GitHub repository variable `PRODUCTION_URL` to the public application origin. `Production Synthetic` then checks live, ready, and deep health hourly without signing in, changing data, or sending messages.

For an object-storage read/write/delete canary, add this Coolify scheduled task to the existing web container:

```sh
SYNTHETIC_S3_CANARY=true npm run ops:synthetic
```

The canary always attempts to delete its randomly named test object. It does not print credentials or secret values.

Calendar synchronization can be scheduled in Coolify without fragile inline JavaScript:

```sh
npm run cron:google-calendar-sync
npm run cron:microsoft-calendar-sync
```

## Local end-to-end run

Run the migrated application and database, then use:

```sh
E2E_BASE_URL=http://127.0.0.1:3000 npm run test:e2e
```

The test requires the same `DATABASE_URL`, `DATABASE_SSL`, and `AUTH_SECRET` used by the running application. Never point mutation tests at production.

## Still external

Twilio and calendar-provider approval cannot be simulated by BandWagon. Keep their sandbox/provider checks separate. A restore drill remains available through `npm run ops:verify-backup-restore` and should run monthly against an isolated restore database.
