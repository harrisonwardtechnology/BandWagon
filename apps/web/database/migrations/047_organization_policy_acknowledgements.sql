BEGIN;

CREATE TABLE IF NOT EXISTS organization_policy_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  terms_version text NOT NULL,
  privacy_version text NOT NULL,
  acknowledged_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  authority_confirmed boolean NOT NULL CHECK (authority_confirmed = true),
  acknowledgement_method text NOT NULL DEFAULT 'admin_console'
    CHECK (acknowledgement_method IN ('admin_console','platform_migration')),
  source_ip_hash text,
  user_agent_hash text,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (organization_id,terms_version,privacy_version)
);

CREATE INDEX IF NOT EXISTS organization_policy_acknowledgements_org_time_idx
  ON organization_policy_acknowledgements(organization_id,acknowledged_at DESC);
CREATE INDEX IF NOT EXISTS organization_policy_acknowledgements_actor_time_idx
  ON organization_policy_acknowledgements(acknowledged_by_person_id,acknowledged_at DESC)
  WHERE acknowledged_by_person_id IS NOT NULL;

COMMIT;
