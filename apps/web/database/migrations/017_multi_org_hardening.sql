BEGIN;

ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS membership_source text NOT NULL DEFAULT 'legacy';

UPDATE memberships
SET membership_source='join_code'
WHERE joined_via_code_id IS NOT NULL AND membership_source='legacy';

-- Top-level organization membership is one row per person + organization. Earlier
-- code treated it that way but did not enforce it in the database. Consolidate any
-- accidental duplicates before adding the unique index.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY organization_id,person_id
           ORDER BY
             CASE WHEN status='active' THEN 0 ELSE 1 END,
             CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END,
             created_at,id
         ) AS rn
  FROM memberships
  WHERE group_id IS NULL
)
DELETE FROM memberships m
USING ranked r
WHERE m.id=r.id AND r.rn>1;

CREATE UNIQUE INDEX IF NOT EXISTS memberships_primary_org_person_unique_idx
  ON memberships(organization_id,person_id)
  WHERE group_id IS NULL;

CREATE TABLE IF NOT EXISTS driver_organization_settings (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  driver_person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'paused' CHECK (status IN ('active','paused','blocked')),
  default_capacity integer NOT NULL DEFAULT 4 CHECK (default_capacity BETWEEN 1 AND 12),
  willing_by_default boolean NOT NULL DEFAULT false,
  allow_multi_passenger boolean NOT NULL DEFAULT true,
  max_detour_minutes integer NOT NULL DEFAULT 15 CHECK (max_detour_minutes BETWEEN 0 AND 90),
  max_pickup_radius_km numeric(6,2) NOT NULL DEFAULT 8.00 CHECK (max_pickup_radius_km BETWEEN 0.25 AND 250),
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,driver_person_id)
);

CREATE INDEX IF NOT EXISTS driver_org_settings_person_idx
  ON driver_organization_settings(driver_person_id,status);

-- Existing driver profiles are safe to carry forward automatically only when the
-- person belongs to exactly one active top-level organization. A multi-org driver
-- is intentionally paused in every org until they explicitly opt in per org.
WITH active_org_counts AS (
  SELECT person_id,count(distinct organization_id)::int AS org_count
  FROM memberships
  WHERE group_id IS NULL AND status='active'
  GROUP BY person_id
)
INSERT INTO driver_organization_settings
  (organization_id,driver_person_id,status,default_capacity,willing_by_default,
   allow_multi_passenger,max_detour_minutes,max_pickup_radius_km,preferences)
SELECT m.organization_id,dp.person_id,
       CASE WHEN c.org_count=1 THEN dp.status ELSE CASE WHEN dp.status='blocked' THEN 'blocked' ELSE 'paused' END END,
       dp.default_capacity,
       CASE WHEN c.org_count=1 THEN dp.willing_by_default ELSE false END,
       dp.allow_multi_passenger,dp.max_detour_minutes,dp.max_pickup_radius_km,dp.preferences
FROM driver_profiles dp
JOIN active_org_counts c ON c.person_id=dp.person_id
JOIN memberships m ON m.person_id=dp.person_id AND m.group_id IS NULL AND m.status='active'
ON CONFLICT (organization_id,driver_person_id) DO NOTHING;

-- New rides snapshot capacity from the organization-specific driver settings.
CREATE OR REPLACE FUNCTION bandwagon_initialize_ride_pooling()
RETURNS trigger AS $$
DECLARE
  request_seats integer;
  offer_seats integer;
  profile_seats integer;
BEGIN
  SELECT seats_needed INTO request_seats FROM ride_requests WHERE id=NEW.ride_request_id;
  SELECT seats_offered INTO offer_seats FROM ride_offers WHERE id=NEW.accepted_offer_id;
  SELECT default_capacity INTO profile_seats
    FROM driver_organization_settings
    WHERE organization_id=NEW.organization_id AND driver_person_id=NEW.driver_person_id;
  NEW.capacity_snapshot := LEAST(12,GREATEST(COALESCE(NEW.capacity_snapshot,1),COALESCE(offer_seats,profile_seats,request_seats,1)));
  NEW.seats_reserved := LEAST(12,GREATEST(COALESCE(NEW.seats_reserved,0),COALESCE(request_seats,1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
