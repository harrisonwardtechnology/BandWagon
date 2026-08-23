BEGIN;

ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_active_organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS product_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS auth_otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL CHECK (purpose IN ('sign_in','sign_up','verify_contact')),
  destination_type text NOT NULL CHECK (destination_type IN ('email','phone')),
  identifier_lookup text NOT NULL,
  destination_ciphertext text NOT NULL,
  person_id uuid REFERENCES people(id) ON DELETE CASCADE,
  user_account_id uuid REFERENCES user_accounts(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  signup_display_name text,
  signup_household_name text,
  request_ip_hash text,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 6 CHECK (max_attempts BETWEEN 1 AND 20),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_account_id uuid NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  ip_hash text,
  user_agent_hash text
);

CREATE TABLE IF NOT EXISTS auth_events (
  id bigserial PRIMARY KEY,
  user_account_id uuid REFERENCES user_accounts(id) ON DELETE SET NULL,
  person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  outcome text NOT NULL DEFAULT 'success',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_otp_lookup_time_idx
  ON auth_otp_challenges(identifier_lookup, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_otp_active_idx
  ON auth_otp_challenges(expires_at)
  WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS auth_sessions_account_idx
  ON auth_sessions(user_account_id, expires_at DESC)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS auth_events_person_time_idx
  ON auth_events(person_id, occurred_at DESC);

COMMIT;
