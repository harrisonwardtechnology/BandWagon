BEGIN;

-- Passkeys (WebAuthn). A passkey is bound to a relying party ID (rp_id):
-- "bandwagon.club" for the platform and every <slug>.bandwagon.club tenant,
-- or the exact custom domain (for example "flomogo.app"). Sign-in only
-- accepts a credential whose rp_id matches the host being used.
CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  -- base64url credential ID exactly as the browser reports it.
  credential_id text NOT NULL UNIQUE CHECK (length(credential_id) BETWEEN 16 AND 1400),
  public_key bytea NOT NULL,
  counter bigint NOT NULL DEFAULT 0 CHECK (counter >= 0),
  transports text[] NOT NULL DEFAULT ARRAY[]::text[],
  device_type text NOT NULL DEFAULT 'singleDevice' CHECK (device_type IN ('singleDevice','multiDevice')),
  backed_up boolean NOT NULL DEFAULT false,
  rp_id text NOT NULL CHECK (length(rp_id) BETWEEN 1 AND 253),
  nickname text NOT NULL DEFAULT 'Passkey' CHECK (length(nickname) BETWEEN 1 AND 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS webauthn_credentials_person_idx
  ON webauthn_credentials(person_id, created_at DESC);

-- Fallback challenge store, used when Redis is not configured. Each row is a
-- single-use challenge bound to one flow (a signed-in session for
-- registration, or a short-lived browser flow cookie for sign-in). Rows are
-- deleted when consumed and purged after expiry.
CREATE TABLE IF NOT EXISTS webauthn_challenges (
  flow_key text PRIMARY KEY CHECK (length(flow_key) BETWEEN 8 AND 200),
  challenge text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS webauthn_challenges_expiry_idx
  ON webauthn_challenges(expires_at);

-- Counters for passkey endpoint rate limits (per IP hash or per account).
CREATE TABLE IF NOT EXISTS auth_rate_limit_events (
  id bigserial PRIMARY KEY,
  bucket text NOT NULL CHECK (length(bucket) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_rate_limit_events_bucket_time_idx
  ON auth_rate_limit_events(bucket, created_at DESC);

COMMIT;
