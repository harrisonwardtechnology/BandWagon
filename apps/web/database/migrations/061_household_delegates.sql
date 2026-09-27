BEGIN;

-- Trusted household delegates (Sprint 14).
--
-- A delegate is a trusted adult outside the household (a grandparent, nanny,
-- or co-parent in another home) who may act for a household's children within
-- scopes the guardian chooses. Delegates are NOT household members and NOT
-- organization members. Every permission check reads these rows fresh, so a
-- pause or revocation takes effect on the very next request.

-- Organizations may turn delegates off. Default is enabled.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS household_delegates_enabled boolean NOT NULL DEFAULT true;

-- Actions taken as a delegate record who acted (actor_person_id) and the child
-- they acted for (on_behalf_of_person_id).
ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS on_behalf_of_person_id uuid REFERENCES people(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS audit_events_on_behalf_of_idx
  ON audit_events(on_behalf_of_person_id, occurred_at DESC) WHERE on_behalf_of_person_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS household_delegates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  delegate_person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  invited_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  relationship_label text CHECK (relationship_label IS NULL OR length(relationship_label) <= 80),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','revoked')),
  can_request_rides boolean NOT NULL DEFAULT false,
  can_approve_rides boolean NOT NULL DEFAULT false,
  can_view_ride_details boolean NOT NULL DEFAULT false,
  can_receive_notifications boolean NOT NULL DEFAULT false,
  -- 'all' covers every minor in the household; 'selected' covers only rows in
  -- household_delegate_children.
  child_scope text NOT NULL DEFAULT 'all' CHECK (child_scope IN ('all','selected')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  paused_at timestamptz,
  revoked_at timestamptz,
  revoked_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  CHECK (status <> 'revoked' OR revoked_at IS NOT NULL)
);

-- One live grant per household and delegate. Revoked rows stay as history.
CREATE UNIQUE INDEX IF NOT EXISTS household_delegates_live_uidx
  ON household_delegates(household_id, delegate_person_id) WHERE status <> 'revoked';
CREATE INDEX IF NOT EXISTS household_delegates_delegate_idx
  ON household_delegates(delegate_person_id) WHERE status <> 'revoked';

CREATE TABLE IF NOT EXISTS household_delegate_children (
  delegate_id uuid NOT NULL REFERENCES household_delegates(id) ON DELETE CASCADE,
  child_person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (delegate_id, child_person_id)
);
CREATE INDEX IF NOT EXISTS household_delegate_children_child_idx ON household_delegate_children(child_person_id);

-- Single-use invite links. Only a sha256 hash of the token is stored. Phone
-- invites store a keyed lookup hash, never the number.
CREATE TABLE IF NOT EXISTS household_delegate_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  invited_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  contact_type text NOT NULL CHECK (contact_type IN ('email','phone')),
  normalized_email text CHECK (normalized_email IS NULL OR length(normalized_email) <= 320),
  phone_lookup_hash text,
  contact_hint text,
  relationship_label text CHECK (relationship_label IS NULL OR length(relationship_label) <= 80),
  token_hash text NOT NULL UNIQUE,
  can_request_rides boolean NOT NULL DEFAULT false,
  can_approve_rides boolean NOT NULL DEFAULT false,
  can_view_ride_details boolean NOT NULL DEFAULT false,
  can_receive_notifications boolean NOT NULL DEFAULT false,
  child_scope text NOT NULL DEFAULT 'all' CHECK (child_scope IN ('all','selected')),
  child_person_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ends_at timestamptz,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  delegate_id uuid REFERENCES household_delegates(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  revoked_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((contact_type = 'email' AND normalized_email IS NOT NULL) OR (contact_type = 'phone' AND phone_lookup_hash IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS household_delegate_invitations_household_idx
  ON household_delegate_invitations(household_id, created_at DESC);
CREATE INDEX IF NOT EXISTS household_delegate_invitations_inviter_time_idx
  ON household_delegate_invitations(invited_by_person_id, created_at DESC);

COMMIT;
