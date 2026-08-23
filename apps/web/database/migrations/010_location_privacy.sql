BEGIN;

CREATE TABLE IF NOT EXISTS private_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  label text,
  address_ciphertext text NOT NULL,
  latitude_ciphertext text,
  longitude_ciphertext text,
  generalized_area text,
  generalized_latitude numeric(9,6),
  generalized_longitude numeric(9,6),
  reveal_policy text NOT NULL DEFAULT 'matched_driver' CHECK (reveal_policy IN ('never','matched_driver','ride_participants')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ride_requests
  ADD COLUMN IF NOT EXISTS pickup_location_id uuid REFERENCES private_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dropoff_location_id uuid REFERENCES private_locations(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS location_access_events (
  id bigserial PRIMARY KEY,
  private_location_id uuid NOT NULL REFERENCES private_locations(id) ON DELETE CASCADE,
  ride_id uuid REFERENCES rides(id) ON DELETE SET NULL,
  actor_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  access_type text NOT NULL,
  granted boolean NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS private_locations_org_idx ON private_locations(organization_id, status);
CREATE INDEX IF NOT EXISTS location_access_events_location_time_idx ON location_access_events(private_location_id, occurred_at DESC);

COMMIT;
