BEGIN;

ALTER TABLE people
  ADD COLUMN IF NOT EXISTS birth_month integer CHECK (birth_month BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS age_band text NOT NULL DEFAULT 'unknown'
    CHECK (age_band IN ('unknown','under_13','13_17','adult')),
  ADD COLUMN IF NOT EXISTS age_screened_at timestamptz;

ALTER TABLE auth_otp_challenges
  ADD COLUMN IF NOT EXISTS signup_birth_month integer CHECK (signup_birth_month BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS signup_birth_year integer;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS minimum_direct_account_age integer NOT NULL DEFAULT 13
    CHECK (minimum_direct_account_age BETWEEN 13 AND 18),
  ADD COLUMN IF NOT EXISTS require_guardian_for_minors boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS guardian_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  minor_person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  guardian_person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  consent_type text NOT NULL DEFAULT 'platform_minor_use',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','expired')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (minor_person_id <> guardian_person_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS guardian_consents_active_unique_idx
  ON guardian_consents(minor_person_id,guardian_person_id,coalesce(organization_id,'00000000-0000-0000-0000-000000000000'::uuid),consent_type)
  WHERE status='active';

CREATE INDEX IF NOT EXISTS guardian_consents_minor_idx
  ON guardian_consents(minor_person_id,status);

-- Existing adult records remain usable without inventing a date of birth.
UPDATE people
SET age_band='adult'
WHERE person_type='adult' AND age_band='unknown';

COMMIT;
