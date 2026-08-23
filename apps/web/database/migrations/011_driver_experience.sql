BEGIN;

ALTER TABLE driver_profiles
  ADD COLUMN IF NOT EXISTS vehicle_label text,
  ADD COLUMN IF NOT EXISTS vehicle_make text,
  ADD COLUMN IF NOT EXISTS vehicle_model text,
  ADD COLUMN IF NOT EXISTS vehicle_color text,
  ADD COLUMN IF NOT EXISTS license_plate_hint text,
  ADD COLUMN IF NOT EXISTS max_detour_minutes integer NOT NULL DEFAULT 15 CHECK (max_detour_minutes BETWEEN 0 AND 90),
  ADD COLUMN IF NOT EXISTS max_pickup_radius_km numeric(6,2) NOT NULL DEFAULT 8.00 CHECK (max_pickup_radius_km BETWEEN 0.25 AND 250),
  ADD COLUMN IF NOT EXISTS allow_multi_passenger boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS driver_service_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  driver_person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  label text NOT NULL,
  generalized_latitude numeric(9,6) NOT NULL,
  generalized_longitude numeric(9,6) NOT NULL,
  radius_km numeric(6,2) NOT NULL DEFAULT 8.00 CHECK (radius_km BETWEEN 0.25 AND 250),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS driver_recurring_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  driver_person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  time_zone text NOT NULL DEFAULT 'America/Chicago',
  direction text NOT NULL DEFAULT 'any' CHECK (direction IN ('any','to_event','from_event','other')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

CREATE TABLE IF NOT EXISTS driver_availability_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  driver_person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  exception_date date NOT NULL,
  available boolean NOT NULL,
  start_time time,
  end_time time,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, driver_person_id, exception_date),
  CHECK ((start_time IS NULL AND end_time IS NULL) OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time))
);

CREATE INDEX IF NOT EXISTS driver_service_zones_driver_idx
  ON driver_service_zones(organization_id, driver_person_id, status);
CREATE INDEX IF NOT EXISTS driver_recurring_availability_driver_idx
  ON driver_recurring_availability(organization_id, driver_person_id, weekday, status);
CREATE INDEX IF NOT EXISTS driver_availability_exceptions_driver_idx
  ON driver_availability_exceptions(organization_id, driver_person_id, exception_date);

COMMIT;
