# Backup and Restore Verification

Run this drill before v1, after material schema changes, and at least quarterly. It must use an isolated, non-production PostgreSQL/PostGIS database.

## Create the Backup

Use a custom-format logical backup and encrypt it at rest:

```bash
pg_dump --format=custom --no-owner --no-privileges --file bandwagon.dump "$SOURCE_DATABASE_URL"
```

Retain the database backup, the matching deployment commit SHA, and the restricted data-encryption keys needed for that backup's retention period. Store them in separate access-controlled systems.

## Restore and Verify

Install PostgreSQL client tools in the operator container, create an empty isolated PostGIS database, then run:

```bash
BACKUP_FILE=/secure/path/bandwagon.dump \
SOURCE_DATABASE_URL="$SOURCE_DATABASE_URL" \
RESTORE_DATABASE_URL="$ISOLATED_RESTORE_DATABASE_URL" \
RESTORE_CONFIRM="RESTORE INTO ISOLATED DATABASE" \
npm run ops:verify-backup-restore
```

The script refuses to use an identical source and restore URL. It validates the archive, restores with ownership/privileges removed, applies any pending migrations, runs the full schema verifier, and compares counts for core operational tables when `SOURCE_DATABASE_URL` is supplied.

After the script passes, deploy the matching application build against the isolated database and smoke-test sign-in, one household, one event, one ride, privacy export, and an encrypted private location. Record the backup timestamp, recovery point, restore duration, commit SHA, row-count result, and operator in the private operations log.

The repository cannot honestly mark production restore verification complete until this drill runs against an actual production backup. No database or PostgreSQL restore tools are configured in the development workspace, so that launch gate remains open.
