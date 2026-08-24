BEGIN;

CREATE TABLE IF NOT EXISTS application_errors (
  id bigserial PRIMARY KEY,
  fingerprint text NOT NULL UNIQUE,
  error_name text NOT NULL,
  message text NOT NULL,
  route_path text,
  request_method text,
  router_kind text,
  route_type text,
  occurrence_count integer NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_stack text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','ignored')),
  resolved_at timestamptz,
  resolved_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS application_errors_status_time_idx
  ON application_errors(status,last_seen_at DESC);

COMMIT;
