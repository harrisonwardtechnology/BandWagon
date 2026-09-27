BEGIN;

-- Durable background work shared by every worker instance. Workers claim rows
-- with FOR UPDATE SKIP LOCKED and hold a lease; a lease that expires (worker
-- crashed or was redeployed) makes the job claimable again.
CREATE TABLE IF NOT EXISTS background_jobs (
  id bigserial PRIMARY KEY,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','dead')),
  run_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 25),
  locked_by text,
  locked_until timestamptz,
  dedupe_key text UNIQUE,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS background_jobs_ready_idx
  ON background_jobs(run_at, id) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS background_jobs_lease_idx
  ON background_jobs(locked_until) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS background_jobs_finished_idx
  ON background_jobs(finished_at) WHERE status IN ('succeeded','dead');

-- Stripe retries and multiple web instances can deliver one event more than once.
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
