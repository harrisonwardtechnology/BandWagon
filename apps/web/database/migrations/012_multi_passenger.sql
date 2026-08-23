BEGIN;

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS capacity_snapshot integer NOT NULL DEFAULT 1 CHECK (capacity_snapshot BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS seats_reserved integer NOT NULL DEFAULT 1 CHECK (seats_reserved BETWEEN 0 AND 12),
  ADD COLUMN IF NOT EXISTS pooling_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE ride_passengers
  ADD COLUMN IF NOT EXISTS seats_reserved integer NOT NULL DEFAULT 1 CHECK (seats_reserved BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS assignment_status text NOT NULL DEFAULT 'confirmed' CHECK (assignment_status IN ('confirmed','cancelled','completed','no_show'));

CREATE TABLE IF NOT EXISTS ride_request_assignments (
  ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  ride_request_id uuid NOT NULL UNIQUE REFERENCES ride_requests(id) ON DELETE CASCADE,
  seats_reserved integer NOT NULL DEFAULT 1 CHECK (seats_reserved BETWEEN 1 AND 12),
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled','completed','no_show')),
  assigned_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ride_id, ride_request_id)
);

CREATE TABLE IF NOT EXISTS ride_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  ride_request_id uuid REFERENCES ride_requests(id) ON DELETE SET NULL,
  person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  private_location_id uuid REFERENCES private_locations(id) ON DELETE SET NULL,
  stop_type text NOT NULL CHECK (stop_type IN ('pickup','dropoff')),
  sequence integer NOT NULL DEFAULT 10 CHECK (sequence BETWEEN 0 AND 1000),
  planned_at timestamptz,
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','arrived','completed','skipped')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

UPDATE rides r
SET capacity_snapshot = LEAST(12, GREATEST(1,
      COALESCE((SELECT ro.seats_offered FROM ride_offers ro WHERE ro.id=r.accepted_offer_id),
               (SELECT dp.default_capacity FROM driver_profiles dp WHERE dp.person_id=r.driver_person_id),
               (SELECT rr.seats_needed FROM ride_requests rr WHERE rr.id=r.ride_request_id),1))),
    seats_reserved = LEAST(12, GREATEST(1,
      COALESCE((SELECT rr.seats_needed FROM ride_requests rr WHERE rr.id=r.ride_request_id),1)));

INSERT INTO ride_request_assignments (ride_id,ride_request_id,seats_reserved,status)
SELECT r.id,r.ride_request_id,rr.seats_needed,
       CASE WHEN r.status='completed' THEN 'completed'
            WHEN r.status='no_show' THEN 'no_show'
            WHEN r.status='cancelled' THEN 'cancelled'
            ELSE 'confirmed' END
FROM rides r
JOIN ride_requests rr ON rr.id=r.ride_request_id
ON CONFLICT (ride_request_id) DO NOTHING;

UPDATE ride_passengers rp
SET seats_reserved = COALESCE((SELECT rr.seats_needed FROM ride_requests rr WHERE rr.id=rp.ride_request_id),1),
    assignment_status = CASE WHEN r.status='completed' THEN 'completed'
                             WHEN r.status='no_show' THEN 'no_show'
                             WHEN r.status='cancelled' THEN 'cancelled'
                             ELSE 'confirmed' END
FROM rides r
WHERE r.id=rp.ride_id;

INSERT INTO ride_stops (ride_id,ride_request_id,person_id,private_location_id,stop_type,sequence,planned_at,status)
SELECT r.id,rr.id,rr.passenger_person_id,rr.pickup_location_id,'pickup',10,rr.requested_pickup_at,
       CASE WHEN r.status IN ('completed','cancelled','no_show') THEN 'skipped' ELSE 'planned' END
FROM rides r
JOIN ride_requests rr ON rr.id=r.ride_request_id
WHERE rr.pickup_location_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM ride_stops rs WHERE rs.ride_id=r.id AND rs.ride_request_id=rr.id AND rs.stop_type='pickup');

INSERT INTO ride_stops (ride_id,ride_request_id,person_id,private_location_id,stop_type,sequence,planned_at,status)
SELECT r.id,rr.id,rr.passenger_person_id,rr.dropoff_location_id,'dropoff',20,rr.requested_dropoff_at,
       CASE WHEN r.status IN ('completed','cancelled','no_show') THEN 'skipped' ELSE 'planned' END
FROM rides r
JOIN ride_requests rr ON rr.id=r.ride_request_id
WHERE rr.dropoff_location_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM ride_stops rs WHERE rs.ride_id=r.id AND rs.ride_request_id=rr.id AND rs.stop_type='dropoff');

CREATE OR REPLACE FUNCTION bandwagon_initialize_ride_pooling()
RETURNS trigger AS $$
DECLARE
  request_seats integer;
  offer_seats integer;
  profile_seats integer;
BEGIN
  SELECT seats_needed INTO request_seats FROM ride_requests WHERE id=NEW.ride_request_id;
  SELECT seats_offered INTO offer_seats FROM ride_offers WHERE id=NEW.accepted_offer_id;
  SELECT default_capacity INTO profile_seats FROM driver_profiles WHERE person_id=NEW.driver_person_id;
  NEW.capacity_snapshot := LEAST(12,GREATEST(COALESCE(NEW.capacity_snapshot,1),COALESCE(offer_seats,profile_seats,request_seats,1)));
  NEW.seats_reserved := LEAST(12,GREATEST(COALESCE(NEW.seats_reserved,0),COALESCE(request_seats,1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bandwagon_initialize_ride_pooling_trigger ON rides;
CREATE TRIGGER bandwagon_initialize_ride_pooling_trigger
BEFORE INSERT ON rides
FOR EACH ROW EXECUTE FUNCTION bandwagon_initialize_ride_pooling();

CREATE OR REPLACE FUNCTION bandwagon_create_primary_assignment()
RETURNS trigger AS $$
DECLARE
  request_seats integer;
  request_passenger uuid;
  pickup_location uuid;
  dropoff_location uuid;
  pickup_at timestamptz;
  dropoff_at timestamptz;
BEGIN
  SELECT seats_needed,passenger_person_id,pickup_location_id,dropoff_location_id,requested_pickup_at,requested_dropoff_at
    INTO request_seats,request_passenger,pickup_location,dropoff_location,pickup_at,dropoff_at
    FROM ride_requests WHERE id=NEW.ride_request_id;
  INSERT INTO ride_request_assignments (ride_id,ride_request_id,seats_reserved,status)
  VALUES (NEW.id,NEW.ride_request_id,COALESCE(request_seats,1),'confirmed')
  ON CONFLICT (ride_request_id) DO NOTHING;
  IF pickup_location IS NOT NULL THEN
    INSERT INTO ride_stops (ride_id,ride_request_id,person_id,private_location_id,stop_type,sequence,planned_at)
    VALUES (NEW.id,NEW.ride_request_id,request_passenger,pickup_location,'pickup',10,pickup_at);
  END IF;
  IF dropoff_location IS NOT NULL THEN
    INSERT INTO ride_stops (ride_id,ride_request_id,person_id,private_location_id,stop_type,sequence,planned_at)
    VALUES (NEW.id,NEW.ride_request_id,request_passenger,dropoff_location,'dropoff',20,dropoff_at);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bandwagon_create_primary_assignment_trigger ON rides;
CREATE TRIGGER bandwagon_create_primary_assignment_trigger
AFTER INSERT ON rides
FOR EACH ROW EXECUTE FUNCTION bandwagon_create_primary_assignment();

CREATE OR REPLACE FUNCTION bandwagon_initialize_ride_passenger_seats()
RETURNS trigger AS $$
DECLARE
  request_seats integer;
BEGIN
  IF NEW.ride_request_id IS NOT NULL THEN
    SELECT seats_needed INTO request_seats FROM ride_requests WHERE id=NEW.ride_request_id;
    NEW.seats_reserved := COALESCE(request_seats,NEW.seats_reserved,1);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bandwagon_initialize_ride_passenger_seats_trigger ON ride_passengers;
CREATE TRIGGER bandwagon_initialize_ride_passenger_seats_trigger
BEFORE INSERT OR UPDATE OF ride_request_id ON ride_passengers
FOR EACH ROW EXECUTE FUNCTION bandwagon_initialize_ride_passenger_seats();

CREATE OR REPLACE FUNCTION bandwagon_sync_pooled_ride_status()
RETURNS trigger AS $$
DECLARE
  assignment_status_value text;
  request_status_value text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status='completed' THEN
    assignment_status_value := 'completed';
    request_status_value := 'completed';
  ELSIF NEW.status='no_show' THEN
    assignment_status_value := 'no_show';
    request_status_value := 'cancelled';
  ELSIF NEW.status='cancelled' THEN
    assignment_status_value := 'cancelled';
    request_status_value := 'cancelled';
  ELSE
    RETURN NEW;
  END IF;
  UPDATE ride_request_assignments
     SET status=assignment_status_value,updated_at=now()
   WHERE ride_id=NEW.id AND status='confirmed';
  UPDATE ride_passengers
     SET assignment_status=assignment_status_value
   WHERE ride_id=NEW.id AND assignment_status='confirmed';
  UPDATE ride_stops
     SET status=CASE WHEN NEW.status='completed' THEN 'completed' ELSE 'skipped' END,
         completed_at=CASE WHEN NEW.status='completed' THEN COALESCE(completed_at,now()) ELSE completed_at END,
         updated_at=now()
   WHERE ride_id=NEW.id AND status IN ('planned','arrived');
  UPDATE ride_requests rr
     SET status=request_status_value,updated_at=now()
   WHERE rr.id IN (SELECT a.ride_request_id FROM ride_request_assignments a WHERE a.ride_id=NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bandwagon_sync_pooled_ride_status_trigger ON rides;
CREATE TRIGGER bandwagon_sync_pooled_ride_status_trigger
AFTER UPDATE OF status ON rides
FOR EACH ROW EXECUTE FUNCTION bandwagon_sync_pooled_ride_status();

CREATE INDEX IF NOT EXISTS ride_request_assignments_ride_idx ON ride_request_assignments(ride_id,status);
CREATE INDEX IF NOT EXISTS ride_stops_ride_sequence_idx ON ride_stops(ride_id,sequence);
CREATE INDEX IF NOT EXISTS ride_stops_request_idx ON ride_stops(ride_request_id);

COMMIT;
