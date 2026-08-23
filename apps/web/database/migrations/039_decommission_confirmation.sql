BEGIN;

CREATE TABLE IF NOT EXISTS organization_decommission_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by_person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  requested_by_platform_role text,
  reason text NOT NULL,
  emergency boolean NOT NULL DEFAULT false,
  typed_confirmation text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  code_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','expired','cancelled','used')),
  delivery_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  confirmed_at timestamptz,
  confirmation_channel text,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_decommission_confirmations_org_idx
  ON organization_decommission_confirmations(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS org_decommission_confirmations_pending_idx
  ON organization_decommission_confirmations(status, expires_at)
  WHERE status='pending';

COMMIT;
