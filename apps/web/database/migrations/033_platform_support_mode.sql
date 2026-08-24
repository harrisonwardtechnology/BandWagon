BEGIN;

ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS platform_role text
    CHECK (platform_role IS NULL OR platform_role IN ('owner','support','finance','readonly'));

CREATE TABLE IF NOT EXISTS platform_support_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_user_account_id uuid NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  target_user_account_id uuid NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  target_organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  mode text NOT NULL DEFAULT 'view' CHECK (mode IN ('view','assist')),
  reason text NOT NULL CHECK (char_length(trim(reason)) >= 5),
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended','expired')),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  ended_by_user_account_id uuid REFERENCES user_accounts(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS platform_support_session_events (
  id bigserial PRIMARY KEY,
  support_session_id uuid NOT NULL REFERENCES platform_support_sessions(id) ON DELETE CASCADE,
  operator_user_account_id uuid NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('started','viewed','write_blocked','ended','expired')),
  request_path text,
  request_method text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_support_sessions_operator_idx
  ON platform_support_sessions(operator_user_account_id,status,started_at DESC);
CREATE INDEX IF NOT EXISTS platform_support_sessions_target_idx
  ON platform_support_sessions(target_user_account_id,started_at DESC);
CREATE INDEX IF NOT EXISTS platform_support_session_events_session_idx
  ON platform_support_session_events(support_session_id,occurred_at DESC);

COMMIT;
