BEGIN;

ALTER TABLE notification_deliveries
  ADD COLUMN IF NOT EXISTS urgency text NOT NULL DEFAULT 'routine',
  ADD COLUMN IF NOT EXISTS correlation_id text;

CREATE INDEX IF NOT EXISTS notification_deliveries_correlation_idx
  ON notification_deliveries(correlation_id)
  WHERE correlation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS notification_deliveries_channel_time_idx
  ON notification_deliveries(channel, created_at DESC);

COMMIT;
