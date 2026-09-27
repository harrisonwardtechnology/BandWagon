BEGIN;

-- Feature ideas from families, drivers, and organization admins. Everything is
-- stored as plain text. A signed-out submitter's email is encrypted at rest
-- (application-level AES-GCM) with a keyed lookup hash, like other contact data.

CREATE TABLE IF NOT EXISTS feature_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  email_ciphertext text,
  email_lookup_hash text,
  title text NOT NULL CHECK (char_length(title) BETWEEN 5 AND 120),
  details text NOT NULL CHECK (char_length(details) BETWEEN 10 AND 4000),
  category text NOT NULL DEFAULT 'other'
    CHECK (category IN ('rides','events','messaging','safety','accessibility','admin','other')),
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','under_review','planned','in_progress','shipped','declined','duplicate')),
  public_note text CHECK (public_note IS NULL OR char_length(public_note) <= 1000),
  duplicate_of_id uuid REFERENCES feature_requests(id) ON DELETE SET NULL,
  vote_count integer NOT NULL DEFAULT 0 CHECK (vote_count >= 0),
  source_ip_hash text,
  status_changed_at timestamptz,
  status_changed_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (duplicate_of_id IS NULL OR duplicate_of_id <> id),
  CHECK (email_ciphertext IS NULL OR char_length(email_ciphertext) <= 1000)
);

CREATE INDEX IF NOT EXISTS feature_requests_status_votes_idx
  ON feature_requests(status, vote_count DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS feature_requests_category_idx
  ON feature_requests(category, created_at DESC);
CREATE INDEX IF NOT EXISTS feature_requests_person_idx
  ON feature_requests(person_id, created_at DESC) WHERE person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS feature_requests_duplicate_of_idx
  ON feature_requests(duplicate_of_id) WHERE duplicate_of_id IS NOT NULL;

-- One vote per person per request. The primary key is the uniqueness guard;
-- feature_requests.vote_count is recomputed from this table after each change.
CREATE TABLE IF NOT EXISTS feature_request_votes (
  request_id uuid NOT NULL REFERENCES feature_requests(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, person_id)
);

CREATE INDEX IF NOT EXISTS feature_request_votes_person_idx
  ON feature_request_votes(person_id);

COMMIT;
