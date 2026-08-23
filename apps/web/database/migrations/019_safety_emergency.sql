BEGIN;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS safety_contact_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS safety_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS safety_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ride_id uuid REFERENCES rides(id) ON DELETE SET NULL,
  triggered_by_person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  alert_type text NOT NULL CHECK (alert_type IN ('help','guardian_alert','emergency_assist','incident')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved','cancelled')),
  message text,
  latitude_ciphertext text,
  longitude_ciphertext text,
  generalized_area text,
  acknowledged_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  resolved_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS safety_alert_recipients (
  safety_alert_id uuid NOT NULL REFERENCES safety_alerts(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  recipient_role text NOT NULL CHECK (recipient_role IN ('guardian','driver','requester','org_safety','self')),
  notification_correlation_id text,
  notified_at timestamptz,
  PRIMARY KEY (safety_alert_id,person_id,recipient_role)
);

CREATE INDEX IF NOT EXISTS safety_alerts_org_time_idx
  ON safety_alerts(organization_id,created_at DESC);
CREATE INDEX IF NOT EXISTS safety_alerts_ride_idx
  ON safety_alerts(ride_id,created_at DESC)
  WHERE ride_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS safety_alerts_open_idx
  ON safety_alerts(organization_id,status,created_at DESC)
  WHERE status IN ('open','acknowledged');

COMMIT;
