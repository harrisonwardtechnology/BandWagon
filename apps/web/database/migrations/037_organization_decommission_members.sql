BEGIN;

CREATE TABLE IF NOT EXISTS organization_decommission_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decommission_id uuid NOT NULL REFERENCES organization_decommissions(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  person_display_name text,
  verified_email_snapshot text,
  other_active_org_count integer NOT NULL DEFAULT 0,
  disposition text NOT NULL CHECK (disposition IN ('remove_org_data_keep_account','remove_account_after_retention')),
  notification_status text NOT NULL DEFAULT 'pending' CHECK (notification_status IN ('pending','sent','partial','failed','skipped')),
  notification_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  notified_at timestamptz,
  data_cleanup_status text NOT NULL DEFAULT 'pending' CHECK (data_cleanup_status IN ('pending','retained_shared','scheduled','completed','failed')),
  data_cleanup_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (decommission_id, person_id)
);

CREATE INDEX IF NOT EXISTS organization_decommission_members_status_idx
  ON organization_decommission_members(decommission_id, notification_status, data_cleanup_status);

COMMIT;
