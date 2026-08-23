BEGIN;

CREATE TABLE IF NOT EXISTS ride_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_ref text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(9), 'hex'),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  requester_person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  passenger_person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('to_event','from_event','round_trip','other')),
  seats_needed integer NOT NULL DEFAULT 1 CHECK (seats_needed BETWEEN 1 AND 12),
  pickup_note text,
  dropoff_note text,
  requested_pickup_at timestamptz,
  requested_dropoff_at timestamptz,
  guardian_approval_status text NOT NULL DEFAULT 'not_required' CHECK (guardian_approval_status IN ('not_required','pending','approved','denied')),
  approved_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  approved_at timestamptz,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('draft','pending_approval','open','matched','cancelled','completed')),
  cancelled_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS driver_profiles (
  person_id uuid PRIMARY KEY REFERENCES people(id) ON DELETE CASCADE,
  default_capacity integer NOT NULL DEFAULT 1 CHECK (default_capacity BETWEEN 1 AND 12),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','blocked')),
  willing_by_default boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ride_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_request_id uuid NOT NULL REFERENCES ride_requests(id) ON DELETE CASCADE,
  driver_person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  seats_offered integer NOT NULL DEFAULT 1 CHECK (seats_offered BETWEEN 1 AND 12),
  note text,
  proposed_pickup_at timestamptz,
  status text NOT NULL DEFAULT 'offered' CHECK (status IN ('offered','accepted','declined','withdrawn','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ride_request_id, driver_person_id)
);

CREATE TABLE IF NOT EXISTS rides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_ref text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(9), 'hex'),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  ride_request_id uuid NOT NULL UNIQUE REFERENCES ride_requests(id) ON DELETE CASCADE,
  accepted_offer_id uuid NOT NULL UNIQUE REFERENCES ride_offers(id) ON DELETE RESTRICT,
  driver_person_id uuid NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','driver_en_route','arrived','picked_up','completed','cancelled','no_show')),
  scheduled_pickup_at timestamptz,
  driver_arrived_at timestamptz,
  picked_up_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ride_passengers (
  ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  ride_request_id uuid REFERENCES ride_requests(id) ON DELETE SET NULL,
  pickup_confirmed_at timestamptz,
  dropoff_confirmed_at timestamptz,
  no_show boolean NOT NULL DEFAULT false,
  PRIMARY KEY (ride_id, person_id)
);

CREATE TABLE IF NOT EXISTS ride_status_events (
  id bigserial PRIMARY KEY,
  ride_id uuid REFERENCES rides(id) ON DELETE CASCADE,
  ride_request_id uuid REFERENCES ride_requests(id) ON DELETE CASCADE,
  actor_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ride_id IS NOT NULL OR ride_request_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS ride_requests_org_status_idx ON ride_requests(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ride_requests_event_idx ON ride_requests(event_id, status);
CREATE INDEX IF NOT EXISTS ride_requests_passenger_idx ON ride_requests(passenger_person_id, status);
CREATE INDEX IF NOT EXISTS ride_offers_request_idx ON ride_offers(ride_request_id, status, created_at);
CREATE INDEX IF NOT EXISTS rides_org_status_idx ON rides(organization_id, status, scheduled_pickup_at);
CREATE INDEX IF NOT EXISTS rides_driver_idx ON rides(driver_person_id, status, scheduled_pickup_at);
CREATE INDEX IF NOT EXISTS ride_status_events_ride_idx ON ride_status_events(ride_id, occurred_at DESC);

COMMIT;
