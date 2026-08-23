BEGIN;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS tenant_hostname text UNIQUE,
  ADD COLUMN IF NOT EXISTS branding jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE organization_domains
  ADD COLUMN IF NOT EXISTS domain_type text NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS target_hostname text,
  ADD COLUMN IF NOT EXISTS cloudflare_custom_hostname_id text,
  ADD COLUMN IF NOT EXISTS ssl_status text,
  ADD COLUMN IF NOT EXISTS dns_status text,
  ADD COLUMN IF NOT EXISTS verification_method text,
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS organization_domains_status_idx
  ON organization_domains(status, hostname);

CREATE INDEX IF NOT EXISTS organizations_tenant_hostname_idx
  ON organizations(tenant_hostname)
  WHERE tenant_hostname IS NOT NULL;

-- FloMoGo is tenant #1. This is idempotent and preserves an existing row.
INSERT INTO organizations (name, display_name, slug, status, discoverability, tenant_hostname)
VALUES ('FloMoGo', 'FloMoGo', 'flomogo', 'active', 'unlisted', 'flomogo.harrisonward.org')
ON CONFLICT (slug) DO UPDATE SET
  display_name = COALESCE(organizations.display_name, EXCLUDED.display_name),
  tenant_hostname = COALESCE(organizations.tenant_hostname, EXCLUDED.tenant_hostname),
  updated_at = now();

INSERT INTO organization_domains
  (organization_id, hostname, status, is_primary, verified_at, activated_at,
   domain_type, target_hostname, dns_status, ssl_status, verification_method)
SELECT id, 'flomogo.harrisonward.org', 'active', true, now(), now(),
       'platform', 'flomogo.harrisonward.org', 'active', 'active', 'platform_wildcard'
FROM organizations WHERE slug='flomogo'
ON CONFLICT (hostname) DO UPDATE SET
  status='active', is_primary=true, domain_type='platform',
  dns_status='active', ssl_status='active', updated_at=now();

COMMIT;
