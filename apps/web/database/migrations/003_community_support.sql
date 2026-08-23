BEGIN;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS support_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sponsorship_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS estimated_cost_per_ride_cents integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS contribution_prompt_frequency integer NOT NULL DEFAULT 5;

CREATE TABLE IF NOT EXISTS support_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  contribution_type text NOT NULL CHECK (contribution_type IN ('individual','sponsor')),
  amount_cents integer NOT NULL CHECK (amount_cents >= 100),
  currency text NOT NULL DEFAULT 'usd',
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id text,
  stripe_customer_email text,
  ride_public_ref text,
  sponsor_name text,
  sponsor_website text,
  sponsor_display_publicly boolean NOT NULL DEFAULT false,
  anonymous boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  refunded_at timestamptz
);

CREATE TABLE IF NOT EXISTS organization_sponsors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contribution_id uuid REFERENCES support_contributions(id) ON DELETE SET NULL,
  sponsor_name text NOT NULL,
  sponsor_website text,
  logo_url text,
  public_display boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_contributions_org_time_idx
  ON support_contributions(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS support_contributions_status_idx
  ON support_contributions(status);

CREATE INDEX IF NOT EXISTS organization_sponsors_org_active_idx
  ON organization_sponsors(organization_id, status);

COMMIT;
