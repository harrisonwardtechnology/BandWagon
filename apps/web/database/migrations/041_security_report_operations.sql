BEGIN;

ALTER TABLE security_reports
  ADD COLUMN IF NOT EXISTS assigned_to_user_account_id uuid REFERENCES user_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS internal_priority integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remediation_reference text;

CREATE TABLE IF NOT EXISTS security_report_events (
  id bigserial PRIMARY KEY,
  security_report_id uuid NOT NULL REFERENCES security_reports(id) ON DELETE CASCADE,
  actor_user_account_id uuid REFERENCES user_accounts(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  public_message text,
  internal_note text,
  from_status text,
  to_status text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_report_events_report_time_idx
  ON security_report_events(security_report_id,created_at DESC);
CREATE INDEX IF NOT EXISTS security_reports_assigned_idx
  ON security_reports(assigned_to_user_account_id,status,created_at DESC);

COMMIT;
