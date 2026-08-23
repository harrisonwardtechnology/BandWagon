BEGIN;

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  location_name text,
  location_address text,
  starts_at timestamptz,
  ends_at timestamptz,
  all_day boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','archived')),
  visibility text NOT NULL DEFAULT 'organization' CHECK (visibility IN ('organization','group','private')),
  ride_coordination_enabled boolean NOT NULL DEFAULT true,
  source_type text NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual','google','microsoft')),
  source_calendar_id text,
  source_event_id text,
  source_url text,
  source_updated_at timestamptz,
  created_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, source_type, source_calendar_id, source_event_id)
);

CREATE TABLE IF NOT EXISTS event_groups (
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  PRIMARY KEY(event_id, group_id)
);

CREATE INDEX IF NOT EXISTS events_org_start_idx ON events(organization_id, starts_at);
CREATE INDEX IF NOT EXISTS events_org_status_idx ON events(organization_id, status, starts_at);
CREATE INDEX IF NOT EXISTS events_source_idx ON events(source_type, source_calendar_id, source_event_id);

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS normalized_event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS normalized_at timestamptz;

CREATE INDEX IF NOT EXISTS calendar_events_normalized_idx
  ON calendar_events(normalized_event_id)
  WHERE normalized_event_id IS NOT NULL;

COMMIT;
