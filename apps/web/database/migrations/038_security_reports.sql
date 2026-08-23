BEGIN;

CREATE TABLE IF NOT EXISTS security_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_id text NOT NULL UNIQUE,
  report_type text NOT NULL DEFAULT 'security' CHECK (report_type IN ('security','privacy','safety','bug')),
  severity text NOT NULL DEFAULT 'unknown' CHECK (severity IN ('unknown','low','medium','high','critical')),
  title text NOT NULL,
  description text NOT NULL,
  reproduction_steps text,
  affected_url text,
  contact_email text NOT NULL,
  secure_evidence_url text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','triage','needs_info','accepted','duplicate','resolved','closed')),
  bounty_status text NOT NULL DEFAULT 'not_reviewed' CHECK (bounty_status IN ('not_reviewed','eligible','ineligible','awarded','paid')),
  bounty_amount_cents integer,
  reporter_acknowledged_safe_harbor boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_reports_status_created_idx
  ON security_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS security_reports_severity_created_idx
  ON security_reports(severity, created_at DESC);

COMMIT;
