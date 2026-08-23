BEGIN;

CREATE TABLE IF NOT EXISTS matching_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ride_request_id uuid NOT NULL REFERENCES ride_requests(id) ON DELETE CASCADE,
  requested_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  candidate_count integer NOT NULL DEFAULT 0,
  suggestion_count integer NOT NULL DEFAULT 0,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS match_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matching_run_id uuid NOT NULL REFERENCES matching_runs(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ride_request_id uuid NOT NULL REFERENCES ride_requests(id) ON DELETE CASCADE,
  candidate_type text NOT NULL CHECK (candidate_type IN ('driver','existing_ride')),
  driver_person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  ride_id uuid REFERENCES rides(id) ON DELETE CASCADE,
  score numeric(6,2) NOT NULL CHECK (score BETWEEN 0 AND 100),
  distance_km numeric(8,2),
  time_gap_minutes integer,
  remaining_capacity integer,
  rationale jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','accepted','dismissed','expired')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS matching_runs_request_idx ON matching_runs(ride_request_id,created_at DESC);
CREATE INDEX IF NOT EXISTS match_suggestions_request_score_idx ON match_suggestions(ride_request_id,status,score DESC);
CREATE INDEX IF NOT EXISTS match_suggestions_driver_idx ON match_suggestions(driver_person_id,status,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS match_suggestions_driver_unique_active
  ON match_suggestions(ride_request_id,driver_person_id)
  WHERE ride_id IS NULL AND status='active';
CREATE UNIQUE INDEX IF NOT EXISTS match_suggestions_ride_unique_active
  ON match_suggestions(ride_request_id,ride_id)
  WHERE ride_id IS NOT NULL AND status='active';

COMMIT;
