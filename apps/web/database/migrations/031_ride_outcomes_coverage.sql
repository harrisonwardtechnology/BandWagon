BEGIN;

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS no_show_at timestamptz,
  ADD COLUMN IF NOT EXISTS no_show_reported_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS no_show_reason text;

CREATE INDEX IF NOT EXISTS rides_org_outcome_idx ON rides(organization_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS ride_requests_org_coverage_idx ON ride_requests(organization_id,status,created_at DESC);

COMMIT;
