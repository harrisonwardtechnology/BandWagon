BEGIN;

CREATE TABLE IF NOT EXISTS ai_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  document_id uuid REFERENCES person_documents(id) ON DELETE SET NULL,
  purpose text NOT NULL,
  provider_path text NOT NULL CHECK (provider_path IN ('litellm','google_document_ai')),
  model_alias text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','completed','failed','cancelled')),
  input_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(5,4),
  human_review_required boolean NOT NULL DEFAULT false,
  prompt_version text,
  input_tokens integer,
  output_tokens integer,
  estimated_cost_microusd bigint NOT NULL DEFAULT 0,
  provider_request_id text,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_usage_daily (
  usage_date date NOT NULL,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  purpose text NOT NULL,
  model_alias text NOT NULL DEFAULT 'specialized',
  job_count integer NOT NULL DEFAULT 0,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  estimated_cost_microusd bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (usage_date,organization_id,purpose,model_alias)
);

CREATE INDEX IF NOT EXISTS ai_jobs_org_time_idx
  ON ai_jobs(organization_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ai_jobs_purpose_time_idx
  ON ai_jobs(purpose,created_at DESC);
CREATE INDEX IF NOT EXISTS ai_jobs_document_idx
  ON ai_jobs(document_id,created_at DESC)
  WHERE document_id IS NOT NULL;

COMMIT;
