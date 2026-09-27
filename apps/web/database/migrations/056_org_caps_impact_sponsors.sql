BEGIN;

-- Per-organization texting fair use. BandWagon is free to organizations, so a
-- single large organization must not run up the shared Twilio bill. A NULL cap
-- means "use the platform default" (ORG_DEFAULT_MONTHLY_SMS_CAP_CENTS).
CREATE TABLE IF NOT EXISTS organization_messaging_limits (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  monthly_cost_cap_cents integer CHECK (monthly_cost_cap_cents IS NULL OR (monthly_cost_cap_cents >= 0 AND monthly_cost_cap_cents <= 10000000)),
  alert_threshold_percent integer NOT NULL DEFAULT 80 CHECK (alert_threshold_percent BETWEEN 1 AND 99),
  notes text CHECK (notes IS NULL OR length(notes) <= 1000),
  updated_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One alert per organization, month, and threshold. The unique key is the
-- dedupe guard; a failed send may be retried by a later message.
CREATE TABLE IF NOT EXISTS organization_messaging_alerts (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  usage_month date NOT NULL,
  threshold_percent integer NOT NULL CHECK (threshold_percent BETWEEN 1 AND 100),
  observed_cost_cents numeric(12,4) NOT NULL DEFAULT 0,
  cap_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  recipient_count integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (organization_id, usage_month, threshold_percent)
);

-- Monthly usage sums filter by organization, mobile channel, and time.
CREATE INDEX IF NOT EXISTS notification_deliveries_org_mobile_time_idx
  ON notification_deliveries(organization_id, created_at)
  WHERE channel IN ('sms','rcs') AND organization_id IS NOT NULL;

-- Impact reporting settings. The public impact page is off by default.
CREATE TABLE IF NOT EXISTS organization_impact_settings (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  public_impact_enabled boolean NOT NULL DEFAULT false,
  miles_per_avoided_trip numeric(5,2) NOT NULL DEFAULT 5 CHECK (miles_per_avoided_trip > 0 AND miles_per_avoided_trip <= 50),
  minutes_per_avoided_trip integer NOT NULL DEFAULT 15 CHECK (minutes_per_avoided_trip BETWEEN 1 AND 120),
  updated_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Sponsor tools for organization admins. Sponsors receive recognition only:
-- no participant data, no matching priority, no targeted advertising.
ALTER TABLE organization_sponsors
  ADD COLUMN IF NOT EXISTS tier_label text,
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS created_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='organization_sponsors_text_lengths_check') THEN
    ALTER TABLE organization_sponsors ADD CONSTRAINT organization_sponsors_text_lengths_check CHECK (
      length(sponsor_name) <= 120
      AND (sponsor_website IS NULL OR length(sponsor_website) <= 500)
      AND (logo_url IS NULL OR length(logo_url) <= 500)
      AND (tier_label IS NULL OR length(tier_label) <= 40)
      AND (internal_notes IS NULL OR length(internal_notes) <= 2000)
    ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='organization_sponsors_https_urls_check') THEN
    ALTER TABLE organization_sponsors ADD CONSTRAINT organization_sponsors_https_urls_check CHECK (
      (sponsor_website IS NULL OR sponsor_website ~* '^https://')
      AND (logo_url IS NULL OR logo_url ~* '^https://')
    ) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS organization_sponsors_public_idx
  ON organization_sponsors(organization_id, starts_at DESC)
  WHERE status='active' AND public_display=true;

COMMIT;
