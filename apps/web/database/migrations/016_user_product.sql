BEGIN;

ALTER TABLE people
  ADD COLUMN IF NOT EXISTS rider_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE ride_requests
  ADD COLUMN IF NOT EXISTS created_via text NOT NULL DEFAULT 'admin' CHECK (created_via IN ('admin','user','import','api'));

ALTER TABLE driver_profiles
  ADD COLUMN IF NOT EXISTS profile_completed_at timestamptz;

CREATE TABLE IF NOT EXISTS user_activity_events (
  id bigserial PRIMARY KEY,
  user_account_id uuid REFERENCES user_accounts(id) ON DELETE SET NULL,
  person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  activity_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_activity_events_person_idx
  ON user_activity_events(person_id, occurred_at DESC);

COMMIT;
