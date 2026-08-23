BEGIN;

CREATE TABLE IF NOT EXISTS organization_ai_settings (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  ai_enabled boolean NOT NULL DEFAULT false,
  document_review_enabled boolean NOT NULL DEFAULT false,
  event_intake_enabled boolean NOT NULL DEFAULT false,
  match_explanations_enabled boolean NOT NULL DEFAULT false,
  admin_copilot_enabled boolean NOT NULL DEFAULT false,
  safety_summaries_enabled boolean NOT NULL DEFAULT false,
  consent_version text,
  consented_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  consented_at timestamptz,
  monthly_budget_cents integer CHECK (monthly_budget_cents IS NULL OR monthly_budget_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO organization_ai_settings (organization_id)
SELECT id FROM organizations
ON CONFLICT (organization_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS organization_ai_setting_events (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  previous_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  consent_version text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organization_ai_setting_events_org_idx
  ON organization_ai_setting_events(organization_id,occurred_at DESC);

COMMIT;
