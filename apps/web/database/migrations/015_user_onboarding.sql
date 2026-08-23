BEGIN;

ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS joined_via_code_id uuid REFERENCES organization_join_codes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE households
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

CREATE TABLE IF NOT EXISTS organization_join_events (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  join_code_id uuid REFERENCES organization_join_codes(id) ON DELETE SET NULL,
  outcome text NOT NULL CHECK (outcome IN ('joined','already_member','rejected')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organization_join_events_person_idx
  ON organization_join_events(person_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS organization_join_events_org_idx
  ON organization_join_events(organization_id, occurred_at DESC);

COMMIT;
