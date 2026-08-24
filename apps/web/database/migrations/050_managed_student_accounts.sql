BEGIN;

CREATE TABLE IF NOT EXISTS managed_student_account_access (
  person_id uuid PRIMARY KEY REFERENCES people(id) ON DELETE CASCADE,
  login_email_id uuid NOT NULL UNIQUE REFERENCES emails(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  authorized_by_guardian_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  authorized_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS managed_student_account_access_guardian_idx
  ON managed_student_account_access(authorized_by_guardian_person_id,updated_at DESC);

ALTER TABLE auth_otp_challenges
  DROP CONSTRAINT IF EXISTS auth_otp_challenges_purpose_check;
ALTER TABLE auth_otp_challenges
  ADD CONSTRAINT auth_otp_challenges_purpose_check
  CHECK (purpose IN ('sign_in','sign_up','verify_contact','managed_student_claim'));

COMMIT;
