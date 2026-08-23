BEGIN;

ALTER TABLE driver_ride_recommendations
  ADD COLUMN IF NOT EXISTS notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS notification_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS notification_result jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS driver_ride_recommendations_notify_idx
  ON driver_ride_recommendations(organization_id,driver_person_id,status,score DESC,created_at DESC)
  WHERE notified_at IS NULL AND status IN ('recommended','viewed');

COMMIT;
