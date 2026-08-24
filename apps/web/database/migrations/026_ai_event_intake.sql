BEGIN;

CREATE TABLE IF NOT EXISTS event_intake_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  source_type text NOT NULL DEFAULT 'pasted_text' CHECK (source_type IN ('pasted_text','email','image','other')),
  source_text_ciphertext text,
  ai_job_id uuid REFERENCES ai_jobs(id) ON DELETE SET NULL,
  proposed_event jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready_for_review','published','rejected','failed')),
  published_event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  reviewed_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_intake_drafts_org_status_idx
  ON event_intake_drafts(organization_id,status,created_at DESC);

COMMIT;
