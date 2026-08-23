BEGIN;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS estimated_driver_validation_cost_cents integer NOT NULL DEFAULT 50
    CHECK (estimated_driver_validation_cost_cents BETWEEN 0 AND 10000);

CREATE TABLE IF NOT EXISTS organization_driver_requirements (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  minimum_driver_age integer NOT NULL DEFAULT 18 CHECK (minimum_driver_age BETWEEN 16 AND 99),
  district_volunteer_mode text NOT NULL DEFAULT 'not_used'
    CHECK (district_volunteer_mode IN ('not_used','display','required')),
  driver_license_mode text NOT NULL DEFAULT 'optional'
    CHECK (driver_license_mode IN ('not_used','optional','required')),
  insurance_mode text NOT NULL DEFAULT 'optional'
    CHECK (insurance_mode IN ('not_used','optional','required')),
  manual_approval_required boolean NOT NULL DEFAULT false,
  suspend_on_expired_credentials boolean NOT NULL DEFAULT true,
  ai_document_review_enabled boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS driver_requirement_status (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  driver_person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  requirement_type text NOT NULL CHECK (requirement_type IN ('district_volunteer','driver_license','insurance','manual_approval')),
  status text NOT NULL DEFAULT 'not_submitted'
    CHECK (status IN ('not_required','not_submitted','pending','verified','approved','rejected','expired')),
  document_id uuid REFERENCES person_documents(id) ON DELETE SET NULL,
  reviewed_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  expires_at date,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,driver_person_id,requirement_type)
);

CREATE TABLE IF NOT EXISTS driver_eligibility_events (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  driver_person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  eligible boolean NOT NULL,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL DEFAULT 'rules',
  occurred_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO organization_driver_requirements (organization_id)
SELECT id FROM organizations
ON CONFLICT (organization_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS driver_requirement_status_org_status_idx
  ON driver_requirement_status(organization_id,status,requirement_type);
CREATE INDEX IF NOT EXISTS driver_requirement_status_expiry_idx
  ON driver_requirement_status(expires_at)
  WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS driver_eligibility_events_driver_idx
  ON driver_eligibility_events(organization_id,driver_person_id,occurred_at DESC);

COMMIT;
