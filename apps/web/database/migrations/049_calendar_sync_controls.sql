BEGIN;

CREATE TABLE IF NOT EXISTS organization_calendar_settings (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  google_sync_enabled boolean NOT NULL DEFAULT true,
  microsoft_sync_enabled boolean NOT NULL DEFAULT true,
  conflict_mode text NOT NULL DEFAULT 'merge_exact'
    CHECK (conflict_mode IN ('merge_exact','keep_separate')),
  updated_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO organization_calendar_settings(organization_id)
SELECT id FROM organizations ON CONFLICT(organization_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS calendar_event_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  calendar_event_id uuid NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  existing_event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  conflict_type text NOT NULL CHECK (conflict_type IN ('exact_duplicate','potential_overlap')),
  resolution text NOT NULL CHECK (resolution IN ('merged','kept_separate','pending_review')),
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(organization_id,calendar_event_id,existing_event_id)
);

CREATE INDEX IF NOT EXISTS calendar_event_conflicts_org_time_idx
  ON calendar_event_conflicts(organization_id,detected_at DESC);
CREATE INDEX IF NOT EXISTS calendar_event_conflicts_pending_idx
  ON calendar_event_conflicts(organization_id,resolution,detected_at DESC)
  WHERE resolution='pending_review';

COMMIT;
