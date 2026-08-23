BEGIN;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS decommission_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS decommission_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS decommission_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS decommission_reason text,
  ADD COLUMN IF NOT EXISTS purge_after timestamptz;

CREATE TABLE IF NOT EXISTS organization_decommissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  organization_slug text NOT NULL,
  organization_name text NOT NULL,
  requested_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  requested_by_platform_role text,
  reason text NOT NULL,
  mode text NOT NULL DEFAULT 'standard' CHECK (mode IN ('standard','emergency')),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','blocked','quiescing','external_cleanup','retention','completed','failed','cancelled')),
  active_ride_count integer NOT NULL DEFAULT 0,
  member_count integer NOT NULL DEFAULT 0,
  custom_domain_count integer NOT NULL DEFAULT 0,
  export_status text NOT NULL DEFAULT 'not_started' CHECK (export_status IN ('not_started','pending','ready','failed','waived')),
  external_cleanup jsonb NOT NULL DEFAULT '{}'::jsonb,
  retention_plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  blockers jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_error text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organization_decommissions_org_idx
  ON organization_decommissions(organization_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS organization_decommissions_status_idx
  ON organization_decommissions(status, updated_at DESC);

COMMIT;
