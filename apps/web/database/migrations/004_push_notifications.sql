BEGIN;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid REFERENCES people(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  device_label text,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid REFERENCES people(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  push_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT true,
  sms_enabled boolean NOT NULL DEFAULT true,
  sms_for_critical_only boolean NOT NULL DEFAULT true,
  reminder_push_enabled boolean NOT NULL DEFAULT true,
  reminder_email_enabled boolean NOT NULL DEFAULT false,
  reminder_sms_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(person_id, organization_id)
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id bigserial PRIMARY KEY,
  person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  notification_type text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('push','email','sms','rcs')),
  destination_ref text,
  provider_message_id text,
  status text NOT NULL,
  estimated_cost_cents numeric(10,4) NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  failed_at timestamptz
);

CREATE INDEX IF NOT EXISTS push_subscriptions_active_idx
  ON push_subscriptions(status, organization_id);

CREATE INDEX IF NOT EXISTS notification_deliveries_org_time_idx
  ON notification_deliveries(organization_id, created_at DESC);

COMMIT;
