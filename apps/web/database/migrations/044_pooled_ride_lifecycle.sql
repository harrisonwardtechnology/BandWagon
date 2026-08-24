BEGIN;

-- Completion is a whole-ride event. Cancellation/no-show disposition depends on
-- who cancelled and which passengers are affected, so application code handles
-- those states transactionally instead of a blanket trigger.
CREATE OR REPLACE FUNCTION bandwagon_sync_pooled_ride_status()
RETURNS trigger AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;

  UPDATE ride_request_assignments
     SET status='completed',updated_at=now()
   WHERE ride_id=NEW.id AND status='confirmed';
  UPDATE ride_passengers
     SET assignment_status='completed'
   WHERE ride_id=NEW.id AND assignment_status='confirmed';
  UPDATE ride_stops
     SET status='completed',completed_at=coalesce(completed_at,now()),updated_at=now()
   WHERE ride_id=NEW.id AND status IN ('planned','arrived');
  UPDATE ride_requests rr
     SET status='completed',updated_at=now()
   WHERE rr.id IN (SELECT a.ride_request_id FROM ride_request_assignments a WHERE a.ride_id=NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bandwagon_sync_pooled_ride_status_trigger ON rides;
CREATE TRIGGER bandwagon_sync_pooled_ride_status_trigger
AFTER UPDATE OF status ON rides
FOR EACH ROW EXECUTE FUNCTION bandwagon_sync_pooled_ride_status();

COMMIT;
