import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Client } = pg;
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required for db:verify");

const useSsl = process.env.DATABASE_SSL === "true";
const client = new Client({
  connectionString: url,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
});

const requiredTables = [
  "organizations",
  "organization_domains",
  "people",
  "households",
  "memberships",
  "events",
  "ride_requests",
  "ride_offers",
  "rides",
  "ride_request_assignments",
  "private_locations",
  "driver_profiles",
  "person_documents",
  "safety_alerts",
  "ride_pickup_handshakes",
  "organization_decommissions",
  "security_reports",
  "platform_health_heartbeats",
  "privacy_requests",
  "privacy_request_events",
  "organization_policy_acknowledgements",
  "microsoft_connections",
  "microsoft_calendars",
  "organization_calendar_settings",
  "calendar_event_conflicts",
];

await client.connect();
try {
  const migrationDir = path.resolve("database/migrations");
  const expectedMigrations = (await fs.readdir(migrationDir))
    .filter((filename) => filename.endsWith(".sql"))
    .sort();
  const applied = await client.query(
    "select filename from schema_migrations order by filename"
  );
  assert.deepEqual(
    applied.rows.map((row) => row.filename),
    expectedMigrations,
    "Applied migration list does not match the repository"
  );

  const postgis = await client.query(
    "select extversion from pg_extension where extname='postgis'"
  );
  assert.equal(postgis.rowCount, 1, "PostGIS extension is not installed");

  for (const table of requiredTables) {
    const result = await client.query("select to_regclass($1) as relation", [
      `public.${table}`,
    ]);
    assert.equal(
      result.rows[0]?.relation,
      table,
      `Required table public.${table} is missing`
    );
  }

  const privacyColumns = [
    ["organizations", "exact_location_retention_days"],
    ["person_documents", "deletion_requested_at"],
    ["person_documents", "delete_after"],
    ["person_documents", "storage_deleted_at"],
    ["person_documents", "storage_delete_error"],
    ["private_locations", "exact_data_delete_after"],
    ["private_locations", "exact_data_deleted_at"],
  ];
  for (const [table, column] of privacyColumns) {
    const result = await client.query(
      `select 1 from information_schema.columns
        where table_schema='public' and table_name=$1 and column_name=$2`,
      [table, column]
    );
    assert.equal(result.rowCount, 1, `Required privacy column ${table}.${column} is missing`);
  }

  const privacyTrigger = await client.query(
    `select 1 from pg_trigger
      where tgname='bandwagon_schedule_exact_location_deletion_trigger' and not tgisinternal`
  );
  assert.equal(privacyTrigger.rowCount, 1, "Exact-location retention trigger is missing");

  const supportAuditForeignKeys = await client.query(
    `select conname,confdeltype
       from pg_constraint
      where conname in (
        'platform_support_sessions_operator_user_account_id_fkey',
        'platform_support_sessions_target_user_account_id_fkey',
        'platform_support_session_events_operator_user_account_id_fkey'
      )`
  );
  assert.equal(supportAuditForeignKeys.rowCount, 3, "Support audit account foreign keys are missing");
  assert.ok(
    supportAuditForeignKeys.rows.every((row) => row.confdeltype === "n"),
    "Support audit account foreign keys must preserve history with ON DELETE SET NULL"
  );

  const boundaryIndexes = await client.query(
    `select indexname
       from pg_indexes
      where schemaname='public'
        and indexname in (
          'memberships_primary_org_person_unique_idx',
          'organization_domains_hostname_key'
        )`
  );
  assert.equal(
    boundaryIndexes.rowCount,
    2,
    "Required organization-boundary indexes are missing"
  );

  const authIndexes = await client.query(
    `select indexname from pg_indexes
      where schemaname='public'
        and indexname in ('auth_otp_request_ip_time_idx','auth_sessions_active_seen_idx')`
  );
  assert.equal(authIndexes.rowCount, 2, "Required authentication hardening indexes are missing");

  const organizationPolicyIndex = await client.query(
    `select 1 from pg_indexes
      where schemaname='public'
        and indexname='organization_policy_acknowledgements_org_time_idx'`
  );
  assert.equal(organizationPolicyIndex.rowCount, 1, "Organization policy acknowledgement index is missing");

  console.log(
    `Verified ${expectedMigrations.length} migrations, PostGIS, ${requiredTables.length} required tables, privacy retention controls, and tenant-boundary indexes.`
  );
} finally {
  await client.end();
}
