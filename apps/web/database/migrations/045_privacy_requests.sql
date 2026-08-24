BEGIN;

CREATE TABLE IF NOT EXISTS privacy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type text NOT NULL CHECK (request_type IN ('export','delete_account')),
  person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  user_account_id uuid REFERENCES user_accounts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','processing','ready','scheduled','blocked','completed','cancelled','failed')),
  scheduled_for timestamptz,
  blockers jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_at timestamptz NOT NULL DEFAULT now(),
  processing_started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS privacy_request_events (
  id bigserial PRIMARY KEY,
  privacy_request_id uuid NOT NULL REFERENCES privacy_requests(id) ON DELETE CASCADE,
  actor_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  event_type text NOT NULL
    CHECK (event_type IN ('requested','exported','scheduled','blocked','processing','completed','cancelled','failed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS privacy_requests_active_delete_account_idx
  ON privacy_requests(user_account_id)
  WHERE request_type='delete_account' AND status IN ('requested','processing','scheduled','blocked','failed');
CREATE INDEX IF NOT EXISTS privacy_requests_due_idx
  ON privacy_requests(scheduled_for,status)
  WHERE request_type='delete_account' AND status IN ('scheduled','blocked','failed');
CREATE INDEX IF NOT EXISTS privacy_request_events_request_time_idx
  ON privacy_request_events(privacy_request_id,occurred_at DESC);

-- Keep immutable support audit history when either participating account is deleted.
-- Earlier migrations used cascading account references, which would otherwise erase
-- the support session and every event underneath it during a privacy deletion.
ALTER TABLE platform_support_sessions
  ALTER COLUMN operator_user_account_id DROP NOT NULL,
  ALTER COLUMN target_user_account_id DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS platform_support_sessions_operator_user_account_id_fkey,
  DROP CONSTRAINT IF EXISTS platform_support_sessions_target_user_account_id_fkey;
ALTER TABLE platform_support_sessions
  ADD CONSTRAINT platform_support_sessions_operator_user_account_id_fkey
    FOREIGN KEY (operator_user_account_id) REFERENCES user_accounts(id) ON DELETE SET NULL,
  ADD CONSTRAINT platform_support_sessions_target_user_account_id_fkey
    FOREIGN KEY (target_user_account_id) REFERENCES user_accounts(id) ON DELETE SET NULL;

ALTER TABLE platform_support_session_events
  ALTER COLUMN operator_user_account_id DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS platform_support_session_events_operator_user_account_id_fkey;
ALTER TABLE platform_support_session_events
  ADD CONSTRAINT platform_support_session_events_operator_user_account_id_fkey
    FOREIGN KEY (operator_user_account_id) REFERENCES user_accounts(id) ON DELETE SET NULL;

ALTER TABLE person_documents
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS delete_after timestamptz,
  ADD COLUMN IF NOT EXISTS storage_deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS storage_delete_error text;

CREATE INDEX IF NOT EXISTS person_documents_delete_after_idx
  ON person_documents(delete_after,status)
  WHERE storage_deleted_at IS NULL AND delete_after IS NOT NULL;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS exact_location_retention_days integer NOT NULL DEFAULT 30
    CHECK (exact_location_retention_days BETWEEN 1 AND 365);

ALTER TABLE private_locations
  ADD COLUMN IF NOT EXISTS exact_data_delete_after timestamptz,
  ADD COLUMN IF NOT EXISTS exact_data_deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS private_locations_exact_delete_after_idx
  ON private_locations(exact_data_delete_after)
  WHERE exact_data_deleted_at IS NULL AND exact_data_delete_after IS NOT NULL;

CREATE OR REPLACE FUNCTION bandwagon_schedule_exact_location_deletion()
RETURNS trigger AS $$
DECLARE
  retention_days integer;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status NOT IN ('completed','cancelled') THEN
    RETURN NEW;
  END IF;

  SELECT exact_location_retention_days INTO retention_days
    FROM organizations WHERE id=NEW.organization_id;

  UPDATE private_locations pl
     SET status='archived',
         exact_data_delete_after=coalesce(
           pl.exact_data_delete_after,
           now()+(coalesce(retention_days,30)||' days')::interval
         ),
         updated_at=now()
   WHERE pl.id IN (NEW.pickup_location_id,NEW.dropoff_location_id)
     AND pl.exact_data_deleted_at IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM ride_requests other
        WHERE other.id<>NEW.id
          AND other.status IN ('draft','pending_approval','open','matched')
          AND (other.pickup_location_id=pl.id OR other.dropoff_location_id=pl.id)
     );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bandwagon_schedule_exact_location_deletion_trigger ON ride_requests;
CREATE TRIGGER bandwagon_schedule_exact_location_deletion_trigger
AFTER UPDATE OF status ON ride_requests
FOR EACH ROW EXECUTE FUNCTION bandwagon_schedule_exact_location_deletion();

-- Backfill completed and cancelled ride-request locations into the retention queue.
UPDATE private_locations pl
   SET status='archived',
       exact_data_delete_after=coalesce(
         pl.exact_data_delete_after,
         now()+(coalesce(o.exact_location_retention_days,30)||' days')::interval
       ),
       updated_at=now()
  FROM organizations o
 WHERE o.id=pl.organization_id
   AND pl.exact_data_deleted_at IS NULL
   AND EXISTS (
     SELECT 1 FROM ride_requests rr
      WHERE rr.status IN ('completed','cancelled')
        AND (rr.pickup_location_id=pl.id OR rr.dropoff_location_id=pl.id)
   )
   AND NOT EXISTS (
     SELECT 1 FROM ride_requests rr
      WHERE rr.status IN ('draft','pending_approval','open','matched')
        AND (rr.pickup_location_id=pl.id OR rr.dropoff_location_id=pl.id)
   );

COMMIT;
