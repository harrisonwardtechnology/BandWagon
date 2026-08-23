BEGIN;

CREATE TABLE IF NOT EXISTS status_monitoring_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  monitor_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  target_url text NOT NULL,
  public_group text NOT NULL DEFAULT 'Communities',
  desired_state text NOT NULL DEFAULT 'active' CHECK (desired_state IN ('active','removed')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','waiting_ready','provisioning','active','degraded','failed','removing','removed')),
  provider text NOT NULL DEFAULT 'uptime_kuma',
  provider_monitor_id text,
  provider_public_component_id text,
  readiness_status text NOT NULL DEFAULT 'unknown' CHECK (readiness_status IN ('unknown','healthy','unhealthy')),
  readiness_checked_at timestamptz,
  last_sync_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  attempt_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS status_monitoring_registrations_work_idx
  ON status_monitoring_registrations(desired_state,status,updated_at);

COMMIT;
