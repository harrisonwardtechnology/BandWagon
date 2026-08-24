BEGIN;

ALTER TABLE organization_domains
  ADD COLUMN IF NOT EXISTS setup_provider_connection_id text,
  ADD COLUMN IF NOT EXISTS provider_monitor_status text NOT NULL DEFAULT 'unknown'
    CHECK (provider_monitor_status IN ('unknown','pending','healthy','degraded','failed','disconnected')),
  ADD COLUMN IF NOT EXISTS provider_last_event_id text,
  ADD COLUMN IF NOT EXISTS provider_last_event_type text,
  ADD COLUMN IF NOT EXISTS provider_last_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_last_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_failure_detail jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS organization_domains_setup_connection_idx
  ON organization_domains(setup_provider,setup_provider_connection_id)
  WHERE setup_provider_connection_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS organization_domains_provider_health_idx
  ON organization_domains(provider_monitor_status,provider_last_event_at DESC)
  WHERE domain_type='custom';

CREATE TABLE IF NOT EXISTS domain_provider_webhook_events (
  event_id text PRIMARY KEY,
  provider text NOT NULL,
  event_type text NOT NULL,
  hostname text,
  organization_domain_id uuid REFERENCES organization_domains(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_status text NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received','processed','ignored','failed')),
  processing_error text
);

CREATE INDEX IF NOT EXISTS domain_provider_webhook_events_time_idx
  ON domain_provider_webhook_events(received_at DESC);

COMMIT;
