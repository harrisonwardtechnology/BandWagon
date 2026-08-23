import { getDb } from "@/lib/db";
import type { SessionIdentity } from "@/lib/auth";

function dbRequired(){const db=getDb();if(!db)throw new Error("Database is not configured");return db;}

async function assertAdmin(identity:SessionIdentity,organizationId:string){
  const db=dbRequired();
  const result=await db.query(`select 1 from memberships where organization_id=$1 and person_id=$2 and group_id is null and status='active' and role in ('owner','admin','manager') limit 1`,[organizationId,identity.personId]);
  if(!result.rowCount)throw new Error("Organization administrator access is required");
}

export async function listAdminOrganizations(identity:SessionIdentity){
  const db=dbRequired();
  return (await db.query(
    `select o.id,coalesce(o.display_name,o.name) as name,o.slug,m.role
     from memberships m join organizations o on o.id=m.organization_id
     where m.person_id=$1 and m.group_id is null and m.status='active' and m.role in ('owner','admin','manager') and o.status='active'
     order by name`,[identity.personId]
  )).rows;
}

export async function getOperationsDashboard(identity:SessionIdentity,organizationId:string){
  await assertAdmin(identity,organizationId);const db=dbRequired();
  const [organization,rideStats,driverStats,pending,expiring,safety,aiUsage,support,validatedDrivers,requirements]=await Promise.all([
    db.query(`select id,coalesce(display_name,name) as name,estimated_cost_per_ride_cents,estimated_driver_validation_cost_cents from organizations where id=$1`,[organizationId]),
    db.query(`select count(*) filter (where created_at>=date_trunc('month',now()))::int as month_rides,count(*) filter (where created_at>=date_trunc('day',now()))::int as today_rides from rides where organization_id=$1`,[organizationId]),
    db.query(`select count(*)::int as total,count(*) filter (where status='active')::int as opted_in,count(*) filter (where status='active' and bandwagon_driver_is_eligible(organization_id,driver_person_id))::int as eligible,count(*) filter (where status='blocked')::int as blocked from driver_organization_settings where organization_id=$1`,[organizationId]),
    db.query(`select drs.*,p.display_name,p.preferred_name,pd.original_filename,pd.content_type,pd.extracted_metadata from driver_requirement_status drs join people p on p.id=drs.driver_person_id left join person_documents pd on pd.id=drs.document_id where drs.organization_id=$1 and drs.status='pending' order by drs.updated_at`,[organizationId]),
    db.query(`select drs.requirement_type,drs.expires_at,p.display_name from driver_requirement_status drs join people p on p.id=drs.driver_person_id where drs.organization_id=$1 and drs.status in ('verified','approved') and drs.expires_at between current_date and current_date+30 order by drs.expires_at`,[organizationId]),
    db.query(`select count(*) filter (where status in ('open','acknowledged'))::int as open_alerts,count(*) filter (where created_at>=date_trunc('month',now()))::int as month_alerts from safety_alerts where organization_id=$1`,[organizationId]),
    db.query(`select purpose,model_alias,sum(job_count)::int as jobs,sum(estimated_cost_microusd)::bigint as cost_microusd from ai_usage_daily where organization_id=$1 and usage_date>=date_trunc('month',current_date)::date group by purpose,model_alias order by cost_microusd desc,purpose`,[organizationId]),
    db.query(`select coalesce(sum(amount_cents) filter (where status='paid'),0)::int as support_cents from support_contributions where organization_id=$1 and created_at>=date_trunc('month',now())`,[organizationId]),
    db.query(`select count(distinct driver_person_id)::int as count from driver_requirement_status where organization_id=$1 and reviewed_at>=date_trunc('month',now()) and status in ('verified','approved')`,[organizationId]),
    db.query(`select * from organization_driver_requirements where organization_id=$1`,[organizationId]),
  ]);
  if(!organization.rowCount)throw new Error("Organization not found");
  const org=organization.rows[0];const rides=rideStats.rows[0]||{};const drivers=driverStats.rows[0]||{};const safetyStats=safety.rows[0]||{};
  const aiRows=aiUsage.rows.map((r:any)=>({...r,costMicrousd:Number(r.cost_microusd||0),costCents:Math.round(Number(r.cost_microusd||0)/10000)}));
  const aiCostMicrousd=aiRows.reduce((sum:number,r:any)=>sum+r.costMicrousd,0);const aiCostCents=Math.round(aiCostMicrousd/10000);
  const rideCostCents=Number(rides.month_rides||0)*Number(org.estimated_cost_per_ride_cents||25);
  const driverValidationCostCents=Number(validatedDrivers.rows[0]?.count||0)*Number(org.estimated_driver_validation_cost_cents||50);
  const estimatedOperatingCostCents=rideCostCents+driverValidationCostCents+aiCostCents;const supportCents=Number(support.rows[0]?.support_cents||0);
  return {
    organization:org,rides:{today:Number(rides.today_rides||0),month:Number(rides.month_rides||0)},
    drivers:{total:Number(drivers.total||0),optedIn:Number(drivers.opted_in||0),eligible:Number(drivers.eligible||0),blocked:Number(drivers.blocked||0),pendingReviews:pending.rowCount||0,expiring30Days:expiring.rowCount||0},
    safety:{open:Number(safetyStats.open_alerts||0),month:Number(safetyStats.month_alerts||0)},pendingReviews:pending.rows,expiringCredentials:expiring.rows,
    ai:{rows:aiRows,totalCostMicrousd:aiCostMicrousd,totalCostCents:aiCostCents},
    economics:{rideCostCents,driverValidationCostCents,aiCostCents,estimatedOperatingCostCents,supportCents,coveragePercent:estimatedOperatingCostCents?Math.round(supportCents/estimatedOperatingCostCents*100):0,validatedDrivers:Number(validatedDrivers.rows[0]?.count||0)},
    requirements:requirements.rows[0]||null,
  };
}

export async function reviewDriverRequirement(identity:SessionIdentity,input:{organizationId:string;driverPersonId:string;requirementType:string;approve:boolean;expiresAt?:string|null;notes?:string|null}){
  await assertAdmin(identity,input.organizationId);const db=dbRequired();
  const validTypes=new Set(["district_volunteer","driver_license","insurance","manual_approval"]);if(!validTypes.has(input.requirementType))throw new Error("Invalid driver requirement");
  const approvedStatus=input.approve?(input.requirementType==="manual_approval"?"approved":"verified"):"rejected";
  const result=await db.query(
    `insert into driver_requirement_status (organization_id,driver_person_id,requirement_type,status,reviewed_by_person_id,reviewed_at,expires_at,notes,updated_at)
     values ($1,$2,$3,$4,$5,now(),$6,$7,now())
     on conflict (organization_id,driver_person_id,requirement_type) do update set status=excluded.status,reviewed_by_person_id=excluded.reviewed_by_person_id,reviewed_at=now(),expires_at=coalesce(excluded.expires_at,driver_requirement_status.expires_at),notes=excluded.notes,updated_at=now()
     returning *`,
    [input.organizationId,input.driverPersonId,input.requirementType,approvedStatus,identity.personId,input.expiresAt||null,input.notes||null]
  );
  await db.query(`insert into audit_events (organization_id,actor_person_id,action,target_type,target_id,metadata) values ($1,$2,'driver_requirement_reviewed','person',$3,$4::jsonb)`,[input.organizationId,identity.personId,input.driverPersonId,JSON.stringify({requirementType:input.requirementType,status:approvedStatus})]);
  return result.rows[0];
}

export async function updateDriverRequirements(identity:SessionIdentity,input:any){
  await assertAdmin(identity,input.organizationId);const db=dbRequired();
  const result=await db.query(
    `update organization_driver_requirements set minimum_driver_age=$1,district_volunteer_mode=$2,driver_license_mode=$3,insurance_mode=$4,manual_approval_required=$5,suspend_on_expired_credentials=$6,ai_document_review_enabled=$7,updated_at=now() where organization_id=$8 returning *`,
    [Math.max(18,Math.min(99,Number(input.minimumDriverAge||18))),input.districtVolunteerMode||"not_used",input.driverLicenseMode||"optional",input.insuranceMode||"optional",Boolean(input.manualApprovalRequired),input.suspendOnExpiredCredentials!==false,input.aiDocumentReviewEnabled!==false,input.organizationId]
  );
  return result.rows[0];
}
