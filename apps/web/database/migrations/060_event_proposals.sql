BEGIN;

-- Optional organization module: moderated member event proposals.
-- Off by default. Members never publish directly; organizers approve.
CREATE TABLE IF NOT EXISTS organization_event_proposal_settings (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  proposer_scope text NOT NULL DEFAULT 'adult_members'
    CHECK (proposer_scope IN ('adult_members','guardians_only')),
  updated_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  proposer_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  description text CHECK (description IS NULL OR char_length(description) <= 2000),
  location_name text CHECK (location_name IS NULL OR char_length(location_name) <= 160),
  location_address text CHECK (location_address IS NULL OR char_length(location_address) <= 300),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz CHECK (ends_at IS NULL OR ends_at > starts_at),
  all_day boolean NOT NULL DEFAULT false,
  expected_riders integer CHECK (expected_riders IS NULL OR expected_riders BETWEEN 0 AND 500),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 1000),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','changes_requested','approved','declined','withdrawn')),
  moderator_note text CHECK (moderator_note IS NULL OR char_length(moderator_note) <= 1000),
  decided_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  decided_at timestamptz,
  approved_event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'approved' OR approved_event_id IS NOT NULL OR decided_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS event_proposals_org_status_idx
  ON event_proposals(organization_id, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS event_proposals_proposer_idx
  ON event_proposals(proposer_person_id, organization_id, created_at DESC);

-- Credit the member whose proposal became this event.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS proposed_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL;

COMMIT;
