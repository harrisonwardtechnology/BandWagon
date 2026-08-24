BEGIN;

CREATE INDEX IF NOT EXISTS auth_otp_request_ip_time_idx
  ON auth_otp_challenges(request_ip_hash,created_at DESC)
  WHERE request_ip_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS auth_sessions_active_seen_idx
  ON auth_sessions(last_seen_at,expires_at)
  WHERE revoked_at IS NULL;

COMMIT;
