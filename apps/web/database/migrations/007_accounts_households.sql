BEGIN;

ALTER TABLE households
  ADD COLUMN IF NOT EXISTS public_ref text UNIQUE,
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE people
  ADD COLUMN IF NOT EXISTS preferred_name text,
  ADD COLUMN IF NOT EXISTS birth_year integer,
  ADD COLUMN IF NOT EXISTS student_approval_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS household_members (
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  household_role text NOT NULL CHECK (household_role IN ('manager','adult','student','dependent')),
  can_manage_household boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, person_id)
);

CREATE TABLE IF NOT EXISTS guardian_relationships (
  guardian_person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  minor_person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  relationship_label text,
  can_approve_rides boolean NOT NULL DEFAULT true,
  can_manage_profile boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guardian_person_id, minor_person_id),
  CHECK (guardian_person_id <> minor_person_id)
);

CREATE TABLE IF NOT EXISTS organization_join_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE,
  label text,
  default_role text NOT NULL DEFAULT 'member',
  max_uses integer,
  use_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS account_events (
  id bigserial PRIMARY KEY,
  person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  user_account_id uuid REFERENCES user_accounts(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS household_members_person_idx ON household_members(person_id);
CREATE INDEX IF NOT EXISTS guardian_relationships_minor_idx ON guardian_relationships(minor_person_id);
CREATE INDEX IF NOT EXISTS organization_join_codes_org_idx ON organization_join_codes(organization_id, status);
CREATE INDEX IF NOT EXISTS account_events_person_time_idx ON account_events(person_id, occurred_at DESC);

-- Backfill the original people.household_id relationship into the canonical junction table.
INSERT INTO household_members (household_id, person_id, household_role, can_manage_household)
SELECT household_id, id,
       CASE WHEN person_type='adult' THEN 'adult' ELSE 'student' END,
       CASE WHEN person_type='adult' THEN true ELSE false END
FROM people
WHERE household_id IS NOT NULL
ON CONFLICT (household_id, person_id) DO NOTHING;

COMMIT;
