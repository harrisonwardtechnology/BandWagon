BEGIN;

-- PostgreSQL UNIQUE(person_id, organization_id) permits multiple NULL organization rows.
-- Consolidate any duplicates before enforcing one global preference row per person.
WITH ranked AS (
  SELECT id,row_number() OVER(PARTITION BY person_id ORDER BY updated_at DESC,created_at DESC,id) rn
  FROM notification_preferences WHERE organization_id IS NULL
)
DELETE FROM notification_preferences n USING ranked r WHERE n.id=r.id AND r.rn>1;

CREATE UNIQUE INDEX IF NOT EXISTS notification_preferences_global_person_unique_idx
  ON notification_preferences(person_id) WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS notification_deliveries_person_time_idx
  ON notification_deliveries(person_id,created_at DESC);
CREATE INDEX IF NOT EXISTS notification_deliveries_status_time_idx
  ON notification_deliveries(status,created_at DESC);

COMMIT;
