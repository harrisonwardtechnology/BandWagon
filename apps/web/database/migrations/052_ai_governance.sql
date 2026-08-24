BEGIN;

ALTER TABLE ai_jobs
  ADD COLUMN IF NOT EXISTS reserved_cost_microusd bigint NOT NULL DEFAULT 0 CHECK (reserved_cost_microusd >= 0),
  ADD COLUMN IF NOT EXISTS policy_decision text,
  ADD COLUMN IF NOT EXISTS fallback_reason text,
  ADD COLUMN IF NOT EXISTS timed_out boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS ai_policy_events (
  id bigserial PRIMARY KEY,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  ai_job_id uuid REFERENCES ai_jobs(id) ON DELETE SET NULL,
  purpose text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('allowed','denied','fallback')),
  reason text,
  monthly_budget_microusd bigint,
  committed_and_reserved_microusd bigint,
  requested_reservation_microusd bigint,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_policy_events_org_time_idx
  ON ai_policy_events(organization_id,occurred_at DESC);

COMMIT;
