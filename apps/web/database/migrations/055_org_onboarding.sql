BEGIN;

-- Self-serve organization onboarding: public requests, platform review,
-- admin invitations and the new-organization setup checklist.

CREATE TABLE IF NOT EXISTS organization_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  requester_user_account_id uuid REFERENCES user_accounts(id) ON DELETE SET NULL,
  organization_name text NOT NULL CHECK (char_length(organization_name) BETWEEN 2 AND 120),
  requested_slug text NOT NULL CHECK (requested_slug ~ '^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$'),
  organization_type text NOT NULL
    CHECK (organization_type IN ('school_band','school_club','youth_sports','faith_community','scouting','other')),
  city text NOT NULL,
  state text NOT NULL,
  approximate_families integer NOT NULL CHECK (approximate_families BETWEEN 1 AND 100000),
  requester_role text NOT NULL,
  sponsoring_organization text,
  website text,
  ride_description text NOT NULL,
  agreement_version text NOT NULL,
  agreement_accepted_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','withdrawn')),
  reviewer_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  review_notes text,
  review_checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  decided_at timestamptz,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  source_ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'rejected' OR (review_notes IS NOT NULL AND char_length(btrim(review_notes)) > 0)),
  CHECK (status <> 'approved' OR organization_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS organization_requests_status_time_idx
  ON organization_requests(status, created_at);
CREATE INDEX IF NOT EXISTS organization_requests_requester_idx
  ON organization_requests(requester_person_id, created_at DESC);
-- Two pending requests cannot hold the same slug at once.
CREATE UNIQUE INDEX IF NOT EXISTS organization_requests_pending_slug_idx
  ON organization_requests(requested_slug) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  normalized_email text NOT NULL CHECK (normalized_email = lower(btrim(normalized_email))),
  role text NOT NULL CHECK (role IN ('admin','manager')),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  revoked_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organization_invitations_org_time_idx
  ON organization_invitations(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS organization_invitations_email_idx
  ON organization_invitations(normalized_email);

CREATE TABLE IF NOT EXISTS organization_setup_progress (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_key text NOT NULL CHECK (item_key ~ '^[a-z_]{2,40}$'),
  completed_at timestamptz NOT NULL DEFAULT now(),
  completed_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  PRIMARY KEY (organization_id, item_key)
);

COMMIT;
