BEGIN;

-- Number-level opt-out registry. Covers numbers that are not (or not yet)
-- attached to a verified phone row, so a STOP sent before signup still sticks.
-- Stores only the keyed lookup hash, never the raw number.
CREATE TABLE IF NOT EXISTS sms_opt_outs (
  lookup_hash text PRIMARY KEY,
  state text NOT NULL CHECK (state IN ('opted_in','opted_out')),
  source text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Proof of consent: who, when, how, and the exact text shown.
CREATE TABLE IF NOT EXISTS sms_consent_events (
  id bigserial PRIMARY KEY,
  person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  lookup_hash text NOT NULL,
  action text NOT NULL CHECK (action IN ('opt_in','opt_out')),
  source text NOT NULL CHECK (source IN ('signup_checkbox','settings','carrier_keyword','twilio_advanced_opt_out')),
  consent_text text,
  consent_text_version text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sms_consent_events_lookup_idx ON sms_consent_events(lookup_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS sms_consent_events_person_idx ON sms_consent_events(person_id, created_at DESC);

-- Carry over any opt-outs already recorded on phone rows.
INSERT INTO sms_opt_outs (lookup_hash, state, source)
SELECT DISTINCT lookup_hash, 'opted_out', 'migrated_phone_status'
  FROM phones
 WHERE messaging_consent_status = 'opted_out'
ON CONFLICT (lookup_hash) DO NOTHING;

COMMIT;
