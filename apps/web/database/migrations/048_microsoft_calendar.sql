BEGIN;

CREATE TABLE IF NOT EXISTS microsoft_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  microsoft_subject text NOT NULL,
  tenant_id text,
  email text,
  display_name text,
  refresh_token_encrypted text NOT NULL,
  access_token_encrypted text,
  access_token_expires_at timestamptz,
  granted_scopes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','error')),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS microsoft_calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES microsoft_connections(id) ON DELETE CASCADE,
  external_calendar_id text NOT NULL,
  summary text NOT NULL,
  color text,
  owner_name text,
  owner_address text,
  can_edit boolean NOT NULL DEFAULT false,
  selected boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz,
  last_sync_at timestamptz,
  sync_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(connection_id,external_calendar_id)
);

CREATE INDEX IF NOT EXISTS microsoft_calendars_selected_idx
  ON microsoft_calendars(connection_id,selected);
CREATE INDEX IF NOT EXISTS microsoft_connections_status_idx
  ON microsoft_connections(status,updated_at DESC);

COMMIT;
