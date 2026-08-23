BEGIN;

CREATE OR REPLACE FUNCTION bandwagon_driver_is_eligible(p_organization_id uuid,p_driver_person_id uuid)
RETURNS boolean AS $$
DECLARE
  req organization_driver_requirements%ROWTYPE;
  person_row people%ROWTYPE;
  settings_status text;
BEGIN
  SELECT * INTO person_row FROM people WHERE id=p_driver_person_id AND status='active';
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT status INTO settings_status
  FROM driver_organization_settings
  WHERE organization_id=p_organization_id AND driver_person_id=p_driver_person_id;
  IF settings_status IS DISTINCT FROM 'active' THEN RETURN false; END IF;

  SELECT * INTO req FROM organization_driver_requirements WHERE organization_id=p_organization_id;
  IF NOT FOUND THEN RETURN true; END IF;

  IF req.minimum_driver_age >= 18 AND person_row.age_band IS DISTINCT FROM 'adult' THEN RETURN false; END IF;

  IF req.district_volunteer_mode='required' AND NOT EXISTS (
    SELECT 1 FROM driver_requirement_status s
    WHERE s.organization_id=p_organization_id AND s.driver_person_id=p_driver_person_id
      AND s.requirement_type='district_volunteer' AND s.status IN ('verified','approved')
      AND (s.expires_at IS NULL OR s.expires_at>=current_date)
  ) THEN RETURN false; END IF;

  IF req.driver_license_mode='required' AND NOT EXISTS (
    SELECT 1 FROM driver_requirement_status s
    WHERE s.organization_id=p_organization_id AND s.driver_person_id=p_driver_person_id
      AND s.requirement_type='driver_license' AND s.status IN ('verified','approved')
      AND (s.expires_at IS NULL OR s.expires_at>=current_date)
  ) THEN RETURN false; END IF;

  IF req.insurance_mode='required' AND NOT EXISTS (
    SELECT 1 FROM driver_requirement_status s
    WHERE s.organization_id=p_organization_id AND s.driver_person_id=p_driver_person_id
      AND s.requirement_type='insurance' AND s.status IN ('verified','approved')
      AND (s.expires_at IS NULL OR s.expires_at>=current_date)
  ) THEN RETURN false; END IF;

  IF req.manual_approval_required AND NOT EXISTS (
    SELECT 1 FROM driver_requirement_status s
    WHERE s.organization_id=p_organization_id AND s.driver_person_id=p_driver_person_id
      AND s.requirement_type='manual_approval' AND s.status='approved'
  ) THEN RETURN false; END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION bandwagon_enforce_offer_driver_eligibility()
RETURNS trigger AS $$
DECLARE org_id uuid;
BEGIN
  SELECT organization_id INTO org_id FROM ride_requests WHERE id=NEW.ride_request_id;
  IF org_id IS NULL OR NOT bandwagon_driver_is_eligible(org_id,NEW.driver_person_id) THEN
    RAISE EXCEPTION 'Driver is not eligible for this organization';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ride_offers_driver_eligibility_trg ON ride_offers;
CREATE TRIGGER ride_offers_driver_eligibility_trg
BEFORE INSERT OR UPDATE OF driver_person_id,status ON ride_offers
FOR EACH ROW WHEN (NEW.status='offered')
EXECUTE FUNCTION bandwagon_enforce_offer_driver_eligibility();

CREATE OR REPLACE FUNCTION bandwagon_enforce_ride_driver_eligibility()
RETURNS trigger AS $$
BEGIN
  IF NOT bandwagon_driver_is_eligible(NEW.organization_id,NEW.driver_person_id) THEN
    RAISE EXCEPTION 'Driver is not eligible for this organization';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rides_driver_eligibility_trg ON rides;
CREATE TRIGGER rides_driver_eligibility_trg
BEFORE INSERT OR UPDATE OF organization_id,driver_person_id ON rides
FOR EACH ROW EXECUTE FUNCTION bandwagon_enforce_ride_driver_eligibility();

CREATE OR REPLACE FUNCTION bandwagon_filter_ineligible_match_suggestion()
RETURNS trigger AS $$
BEGIN
  IF NEW.candidate_type='driver' AND NOT bandwagon_driver_is_eligible(NEW.organization_id,NEW.driver_person_id) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS match_suggestions_driver_eligibility_trg ON match_suggestions;
CREATE TRIGGER match_suggestions_driver_eligibility_trg
BEFORE INSERT ON match_suggestions
FOR EACH ROW EXECUTE FUNCTION bandwagon_filter_ineligible_match_suggestion();

COMMIT;
