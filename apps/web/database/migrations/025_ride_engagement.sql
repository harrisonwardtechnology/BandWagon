BEGIN;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS ride_reminders_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_24h_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_1h_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS ride_reminder_dispatches (
  ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  reminder_type text NOT NULL CHECK (reminder_type IN ('24h','1h')),
  scheduled_for timestamptz NOT NULL,
  notification_correlation_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ride_id,person_id,reminder_type)
);

CREATE INDEX IF NOT EXISTS ride_reminder_dispatches_status_idx
  ON ride_reminder_dispatches(status,scheduled_for);

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS last_engagement_at timestamptz;

COMMIT;
