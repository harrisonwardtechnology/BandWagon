import { getDb } from "@/lib/db";

function dbRequired() {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

type EligibilityResult = {
  eligible: boolean;
  reasons: string[];
  requirements: Record<string, unknown> | null;
  statuses: Record<string, any>;
};

function accepted(status: string | undefined) {
  return status === "verified" || status === "approved";
}

export async function evaluateDriverEligibility(organizationId: string, driverPersonId: string, recordEvent = false): Promise<EligibilityResult> {
  const db = dbRequired();
  const [personResult,settingsResult,requirementsResult,statusResult] = await Promise.all([
    db.query(`select id,person_type,age_band,birth_month,birth_year from people where id=$1 and status='active'`,[driverPersonId]),
    db.query(`select status from driver_organization_settings where organization_id=$1 and driver_person_id=$2`,[organizationId,driverPersonId]),
    db.query(`select * from organization_driver_requirements where organization_id=$1`,[organizationId]),
    db.query(`select * from driver_requirement_status where organization_id=$1 and driver_person_id=$2`,[organizationId,driverPersonId]),
  ]);
  const person = personResult.rows[0];
  if (!person) return { eligible:false,reasons:["Driver profile is unavailable"],requirements:null,statuses:{} };
  const requirements = requirementsResult.rows[0] || {
    minimum_driver_age:18,district_volunteer_mode:"not_used",driver_license_mode:"optional",insurance_mode:"optional",
    manual_approval_required:false,suspend_on_expired_credentials:true,
  };
  const statuses = Object.fromEntries(statusResult.rows.map((row:any)=>[row.requirement_type,row]));
  const reasons:string[] = [];

  if (!settingsResult.rowCount || settingsResult.rows[0].status !== "active") reasons.push("Driving is not enabled for this organization");

  const minimumAge = Number(requirements.minimum_driver_age || 18);
  if (minimumAge >= 18 && person.age_band !== "adult") reasons.push(`Driver must be at least ${minimumAge}`);
  else if (minimumAge > 18 && person.birth_year) {
    const now = new Date();
    let age = now.getUTCFullYear() - Number(person.birth_year);
    if (person.birth_month && now.getUTCMonth()+1 < Number(person.birth_month)) age--;
    if (age < minimumAge) reasons.push(`Driver must be at least ${minimumAge}`);
  }

  const today = new Date().toISOString().slice(0,10);
  function check(type:string,mode:string,label:string) {
    if (mode !== "required") return;
    const row = statuses[type];
    if (!row || !accepted(row.status)) { reasons.push(`${label} is not verified`); return; }
    if (requirements.suspend_on_expired_credentials && row.expires_at && String(row.expires_at).slice(0,10) < today) reasons.push(`${label} is expired`);
  }
  check("district_volunteer",requirements.district_volunteer_mode,"Volunteer approval");
  check("driver_license",requirements.driver_license_mode,"Driver license");
  check("insurance",requirements.insurance_mode,"Insurance");
  if (requirements.manual_approval_required && !accepted(statuses.manual_approval?.status)) reasons.push("Organization driver approval is pending");

  const result = { eligible:reasons.length===0,reasons,requirements,statuses };
  if (recordEvent) {
    await db.query(
      `insert into driver_eligibility_events (organization_id,driver_person_id,eligible,reasons,source)
       values ($1,$2,$3,$4::jsonb,'rules')`,
      [organizationId,driverPersonId,result.eligible,JSON.stringify(reasons)]
    );
  }
  return result;
}

export async function requireEligibleDriver(organizationId:string,driverPersonId:string) {
  const result = await evaluateDriverEligibility(organizationId,driverPersonId,true);
  if (!result.eligible) throw new Error(`Driver is not eligible for this organization: ${result.reasons.join("; ")}`);
  return result;
}

export async function getMyDriverSafetyStatus(personId:string) {
  const db = dbRequired();
  const organizations = await db.query(
    `select o.id,coalesce(o.display_name,o.name) as name
     from memberships m join organizations o on o.id=m.organization_id
     where m.person_id=$1 and m.group_id is null and m.status='active' and o.status='active'
     order by name`,[personId]
  );
  const rows=[];
  for (const organization of organizations.rows) {
    rows.push({ organization,...await evaluateDriverEligibility(organization.id,personId,false) });
  }
  return rows;
}
