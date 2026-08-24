BEGIN;

CREATE TABLE IF NOT EXISTS status_monitoring_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  monitor_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  target_url text NOT NULL,
  public_group text NOT NULL DEFAULT 'Communities',
  desired_state text NOT NULL DEFAULT 'active' CHECK (desired_state IN ('active','removed')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','waiting_ready','provisioning','active','degraded','failed','removing','removed')),
  provider text NOT NULL DEFAULT 'uptime_kuma',
  provider_monitor_id text,
  provider_public_component_id text,
  readiness_status text NOT NULL DEFAULT 'unknown' CHECK (readiness_status IN ('unknown','healthy','unhealthy')),
  readiness_checked_at timestamptz,
  last_sync_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  attempt_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS status_monitoring_registrations_work_idx
  ON status_monitoring_registrations(desired_state,status,updated_at);

CREATE OR REPLACE FUNCTION bandwagon_register_status_monitoring()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_hostname IS NOT NULL AND NEW.tenant_hostname <> '' AND NEW.status <> 'decommissioning' THEN
    INSERT INTO status_monitoring_registrations
      (organization_id,monitor_key,display_name,target_url,desired_state,status,updated_at)
    VALUES
      (NEW.id,'community:'||NEW.id::text,coalesce(NEW.display_name,NEW.name),
       'https://'||NEW.tenant_hostname||'/api/health/ready','active','pending',now())
    ON CONFLICT (organization_id) DO UPDATE SET
      display_name=excluded.display_name,
      target_url=excluded.target_url,
      desired_state='active',
      status=case when status_monitoring_registrations.status='removed' then 'pending' else status_monitoring_registrations.status end,
      updated_at=now();
  ELSIF NEW.status='decommissioning' THEN
    UPDATE status_monitoring_registrations
       SET desired_state='removed',
           status=case when status='removed' then status else 'removing' end,
           updated_at=now()
     WHERE organization_id=NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_status_monitoring_sync ON organizations;
CREATE TRIGGER organizations_status_monitoring_sync
AFTER INSERT OR UPDATE OF tenant_hostname,status,display_name,name ON organizations
FOR EACH ROW EXECUTE FUNCTION bandwagon_register_status_monitoring();

INSERT INTO status_monitoring_registrations
  (organization_id,monitor_key,display_name,target_url,desired_state,status)
SELECT id,'community:'||id::text,coalesce(display_name,name),
       'https://'||tenant_hostname||'/api/health/ready','active','pending'
FROM organizations
WHERE tenant_hostname IS NOT NULL AND tenant_hostname<>'' AND status='active'
ON CONFLICT (organization_id) DO NOTHING;

COMMIT;
