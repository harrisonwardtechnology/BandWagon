BEGIN;

CREATE TABLE IF NOT EXISTS platform_health_heartbeats (
  component_key text PRIMARY KEY,
  component_type text NOT NULL CHECK (component_type IN ('cron','integration','service','storage','database')),
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('healthy','degraded','failed','unknown')),
  last_started_at timestamptz,
  last_succeeded_at timestamptz,
  last_failed_at timestamptz,
  last_duration_ms integer,
  consecutive_failures integer NOT NULL DEFAULT 0,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_health_heartbeats_status_idx
  ON platform_health_heartbeats(status,updated_at DESC);

COMMIT;
