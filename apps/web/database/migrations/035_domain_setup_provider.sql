BEGIN;

ALTER TABLE organization_domains
  ADD COLUMN IF NOT EXISTS setup_mode text NOT NULL DEFAULT 'manual'
    CHECK (setup_mode IN ('automatic','manual')),
  ADD COLUMN IF NOT EXISTS setup_provider text,
  ADD COLUMN IF NOT EXISTS setup_provider_session_id text,
  ADD COLUMN IF NOT EXISTS setup_status text NOT NULL DEFAULT 'not_started'
    CHECK (setup_status IN ('not_started','pending','verified','failed','manual_required')),
  ADD COLUMN IF NOT EXISTS setup_last_error text,
  ADD COLUMN IF NOT EXISTS setup_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS organization_domains_setup_status_idx
  ON organization_domains(setup_status, setup_updated_at DESC)
  WHERE domain_type='custom';

COMMIT;
