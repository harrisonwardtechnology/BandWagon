BEGIN;

-- Waitlists and standby offers (Sprint 12).
--
-- When a carpool is full, a rider (or a guardian on behalf of a minor) joins
-- the waitlist for that ride. Each entry is backed by a normal ride request, so
-- guardian approval rules are exactly the same as for any seat request.
-- When a seat opens, the first eligible entry (FIFO by joined_at) receives a
-- time-limited standby offer. Accepting claims the seat inside a transaction
-- that locks the ride row, so two people can never take the same seat.

CREATE TABLE IF NOT EXISTS organization_waitlist_settings (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  waitlists_enabled boolean NOT NULL DEFAULT true,
  offer_window_minutes integer NOT NULL DEFAULT 30 CHECK (offer_window_minutes BETWEEN 5 AND 240),
  departure_cutoff_minutes integer NOT NULL DEFAULT 15 CHECK (departure_cutoff_minutes BETWEEN 0 AND 240),
  updated_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ride_waitlist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('to_event','from_event','round_trip','other')),
  ride_request_id uuid NOT NULL REFERENCES ride_requests(id) ON DELETE CASCADE,
  passenger_person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  joined_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  seats_needed integer NOT NULL DEFAULT 1 CHECK (seats_needed BETWEEN 1 AND 12),
  status text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting','offered','accepted','declined','expired','left','removed','cancelled')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  -- The ride the standby seat is on. Usually ride_id, but a new carpool for the
  -- same event and direction can offer its seats to people waiting elsewhere.
  offered_ride_id uuid REFERENCES rides(id) ON DELETE SET NULL,
  offered_at timestamptz,
  offer_expires_at timestamptz,
  offer_count integer NOT NULL DEFAULT 0 CHECK (offer_count >= 0),
  responded_at timestamptz,
  ended_at timestamptz,
  end_reason text CHECK (end_reason IS NULL OR length(end_reason) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'offered' OR (offer_expires_at IS NOT NULL AND offered_ride_id IS NOT NULL))
);

-- One active entry per rider per ride. Duplicate joins hit this constraint.
CREATE UNIQUE INDEX IF NOT EXISTS ride_waitlist_entries_active_unique
  ON ride_waitlist_entries(ride_id, passenger_person_id)
  WHERE status IN ('waiting','offered');

CREATE INDEX IF NOT EXISTS ride_waitlist_entries_queue_idx
  ON ride_waitlist_entries(ride_id, status, joined_at, id);
CREATE INDEX IF NOT EXISTS ride_waitlist_entries_event_queue_idx
  ON ride_waitlist_entries(event_id, direction, status, joined_at, id)
  WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS ride_waitlist_entries_offer_expiry_idx
  ON ride_waitlist_entries(offer_expires_at)
  WHERE status = 'offered';
CREATE INDEX IF NOT EXISTS ride_waitlist_entries_offered_ride_idx
  ON ride_waitlist_entries(offered_ride_id)
  WHERE status = 'offered';
CREATE INDEX IF NOT EXISTS ride_waitlist_entries_passenger_idx
  ON ride_waitlist_entries(passenger_person_id, status);
CREATE INDEX IF NOT EXISTS ride_waitlist_entries_org_idx
  ON ride_waitlist_entries(organization_id, status, joined_at);

COMMIT;
