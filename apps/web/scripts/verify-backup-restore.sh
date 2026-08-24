#!/usr/bin/env bash
set -euo pipefail

: "${BACKUP_FILE:?BACKUP_FILE is required}"
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"
: "${RESTORE_CONFIRM:?RESTORE_CONFIRM is required}"

if [[ "$RESTORE_CONFIRM" != "RESTORE INTO ISOLATED DATABASE" ]]; then
  echo "RESTORE_CONFIRM must equal: RESTORE INTO ISOLATED DATABASE" >&2
  exit 1
fi
if [[ -n "${SOURCE_DATABASE_URL:-}" && "$SOURCE_DATABASE_URL" == "$RESTORE_DATABASE_URL" ]]; then
  echo "Refusing to restore over the source database" >&2
  exit 1
fi
if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Backup file was not found" >&2
  exit 1
fi
for command_name in pg_restore psql node; do
  command -v "$command_name" >/dev/null || { echo "$command_name is required" >&2; exit 1; }
done

pg_restore --list "$BACKUP_FILE" >/dev/null
pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error --dbname "$RESTORE_DATABASE_URL" "$BACKUP_FILE"
DATABASE_URL="$RESTORE_DATABASE_URL" node scripts/migrate.mjs
DATABASE_URL="$RESTORE_DATABASE_URL" node scripts/verify-schema.mjs

tables=(organizations people households memberships events ride_requests rides audit_events)
for table_name in "${tables[@]}"; do
  restored_count=$(psql "$RESTORE_DATABASE_URL" -XAtqc "select count(*) from $table_name")
  if [[ -n "${SOURCE_DATABASE_URL:-}" ]]; then
    source_count=$(psql "$SOURCE_DATABASE_URL" -XAtqc "select count(*) from $table_name")
    if [[ "$source_count" != "$restored_count" ]]; then
      echo "Row-count mismatch for $table_name: source=$source_count restored=$restored_count" >&2
      exit 1
    fi
  fi
  echo "$table_name: $restored_count rows verified"
done

echo "Backup restore verification passed in the isolated target database."
