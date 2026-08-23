BEGIN;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS pickup_verification_mode text NOT NULL DEFAULT 'recommended'
    CHECK (pickup_verification_mode IN ('off','optional','recommended','required'));

ALTER TABLE guardian_relationships
  ADD COLUMN IF NOT EXISTS require_verified_pickup boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS ride_pickup_handshakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  driver_person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  passenger_person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  initiated_by_person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  fallback_code_hash text NOT NULL,
  phrase_color text NOT NULL,
  phrase_word text NOT NULL,
  phrase_icon text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','driver_confirmed','passenger_confirmed','verified','expired','cancelled','mismatch')),
  driver_confirmed_at timestamptz,
  passenger_confirmed_at timestamptz,
  verified_at timestamptz,
  expires_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ride_pickup_handshake_events (
  id bigserial PRIMARY KEY,
  handshake_id uuid NOT NULL REFERENCES ride_pickup_handshakes(id) ON DELETE CASCADE,
  ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  actor_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  outcome text NOT NULL DEFAULT 'success',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ride_pickup_handshake_one_active_idx
  ON ride_pickup_handshakes(ride_id)
  WHERE status IN ('pending','driver_confirmed','passenger_confirmed');
CREATE INDEX IF NOT EXISTS ride_pickup_handshake_token_idx ON ride_pickup_handshakes(token_hash);
CREATE INDEX IF NOT EXISTS ride_pickup_handshake_expiry_idx ON ride_pickup_handshakes(expires_at)
  WHERE status IN ('pending','driver_confirmed','passenger_confirmed');
CREATE INDEX IF NOT EXISTS ride_pickup_handshake_events_ride_idx ON ride_pickup_handshake_events(ride_id,occurred_at DESC);

CREATE OR REPLACE FUNCTION bandwagon_enforce_verified_pickup()
RETURNS trigger AS $$
DECLARE
  org_mode text;
  passenger_id uuid;
  guardian_requires boolean;
  verified boolean;
BEGIN
  IF NEW.status <> 'picked_up' OR OLD.status = 'picked_up' THEN
    RETURN NEW;
  END IF;

  SELECT o.pickup_verification_mode, rr.passenger_person_id
    INTO org_mode, passenger_id
  FROM organizations o
  JOIN ride_requests rr ON rr.organization_id=o.id
  WHERE o.id=NEW.organization_id AND rr.id=NEW.ride_request_id;

  SELECT EXISTS(
    SELECT 1 FROM guardian_relationships
    WHERE minor_person_id=passenger_id AND require_verified_pickup=true
  ) INTO guardian_requires;

  IF org_mode <> 'required' AND NOT guardian_requires THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM ride_pickup_handshakes
    WHERE ride_id=NEW.id AND status='verified' AND verified_at IS NOT NULL
  ) INTO verified;

  IF NOT verified THEN
    RAISE EXCEPTION 'Verified pickup handshake is required before this rider can be marked picked up';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rides_verified_pickup_guard ON rides;
CREATE TRIGGER rides_verified_pickup_guard
BEFORE UPDATE OF status ON rides
FOR EACH ROW EXECUTE FUNCTION bandwagon_enforce_verified_pickup();

COMMIT;
