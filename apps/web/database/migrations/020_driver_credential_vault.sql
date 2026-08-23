BEGIN;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS credential_storage_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS credential_retention_days integer NOT NULL DEFAULT 90
    CHECK (credential_retention_days BETWEEN 1 AND 3650);

CREATE TABLE IF NOT EXISTS person_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('driver_license','insurance','volunteer_approval','other')),
  storage_provider text NOT NULL DEFAULT 'ionos_s3',
  storage_bucket text NOT NULL,
  storage_key text NOT NULL UNIQUE,
  original_filename text,
  content_type text,
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  sha256 text,
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('pending_upload','uploaded','processing','ready','rejected','replaced','deleted')),
  issued_at date,
  expires_at date,
  extracted_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  uploaded_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  uploaded_at timestamptz,
  replaced_by_document_id uuid REFERENCES person_documents(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_access_events (
  id bigserial PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES person_documents(id) ON DELETE CASCADE,
  actor_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  access_type text NOT NULL CHECK (access_type IN ('upload_url','view_url','download','ai_process','metadata_view','delete')),
  granted boolean NOT NULL DEFAULT true,
  purpose text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS person_documents_person_type_idx
  ON person_documents(person_id,document_type,status,created_at DESC);
CREATE INDEX IF NOT EXISTS person_documents_expiration_idx
  ON person_documents(expires_at)
  WHERE status='ready' AND expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS document_access_events_document_time_idx
  ON document_access_events(document_id,occurred_at DESC);

COMMIT;
