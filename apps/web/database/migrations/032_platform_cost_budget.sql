BEGIN;

CREATE TABLE IF NOT EXISTS platform_cost_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_month date NOT NULL,
  budget_cents integer NOT NULL CHECK (budget_cents > 0),
  alert_recipients text[] NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (budget_month)
);

CREATE TABLE IF NOT EXISTS platform_cost_budget_alerts (
  id bigserial PRIMARY KEY,
  budget_id uuid NOT NULL REFERENCES platform_cost_budgets(id) ON DELETE CASCADE,
  threshold_percent integer NOT NULL CHECK (threshold_percent IN (50,75,90,95,100)),
  observed_cost_cents integer NOT NULL,
  budget_cents integer NOT NULL,
  sent_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (budget_id,threshold_percent)
);

CREATE INDEX IF NOT EXISTS platform_cost_budget_alerts_status_idx
  ON platform_cost_budget_alerts(status,created_at DESC);

COMMIT;
