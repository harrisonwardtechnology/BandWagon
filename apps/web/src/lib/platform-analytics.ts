import { getDb } from "@/lib/db";
import { getPlatformCostSnapshot } from "@/lib/platform-budget";

function dbRequired(){const db=getDb();if(!db)throw new Error('Database is not configured');return db;}

export async function getUsageWindows(){
  const db=dbRequired();
  const windows=[7,30,90];
  const result:any={};
  for(const days of windows){
    const [users,newUsers,rides,completed,requests,drivers,supportSessions,notifications]=await Promise.all([
      db.query(`select count(*)::int as count from user_accounts where status='active' and last_login_at>=now()-($1||' days')::interval`,[days]),
      db.query(`select count(*)::int as count from user_accounts where created_at>=now()-($1||' days')::interval`,[days]),
      db.query(`select count(*)::int as count from rides where created_at>=now()-($1||' days')::interval`,[days]),
      db.query(`select count(*)::int as count from rides where status='completed' and coalesce(completed_at,updated_at,created_at)>=now()-($1||' days')::interval`,[days]).catch(()=>({rows:[{count:0}]} as any)),
      db.query(`select count(*)::int as count from ride_requests where created_at>=now()-($1||' days')::interval`,[days]),
      db.query(`select count(distinct driver_person_id)::int as count from driver_organization_settings where status='active' and updated_at>=now()-($1||' days')::interval`,[days]).catch(()=>db.query(`select count(distinct driver_person_id)::int as count from driver_organization_settings where status='active'`)),
      db.query(`select count(*)::int as count from platform_support_sessions where started_at>=now()-($1||' days')::interval`,[days]).catch(()=>({rows:[{count:0}]} as any)),
      db.query(`select count(*)::int as count from notification_deliveries where created_at>=now()-($1||' days')::interval`,[days]),
    ]);
    result[days]={activeUsers:Number(users.rows[0]?.count||0),newUsers:Number(newUsers.rows[0]?.count||0),rides:Number(rides.rows[0]?.count||0),completedRides:Number(completed.rows[0]?.count||0),rideRequests:Number(requests.rows[0]?.count||0),activeDrivers:Number(drivers.rows[0]?.count||0),supportSessions:Number(supportSessions.rows[0]?.count||0),notifications:Number(notifications.rows[0]?.count||0)};
  }
  return result;
}

export async function getFeatureAdoptionSnapshot(){
  const db=dbRequired();
  const [orgs,drivers,routeAssist,ai,pushUsers,pickupEligible,pickupVerified,customDomains,credentialDrivers]=await Promise.all([
    db.query(`select count(*)::int as count from organizations where status='active'`),
    db.query(`select count(distinct organization_id::text||':'||driver_person_id::text)::int as count from driver_organization_settings where status='active'`),
    db.query(`select count(*)::int as count from driver_organization_settings where status='active' and route_assist_enabled=true`),
    db.query(`select count(*)::int as count from organization_ai_settings where ai_enabled=true`).catch(()=>({rows:[{count:0}]} as any)),
    db.query(`select count(distinct person_id)::int as count from push_subscriptions where status='active'`),
    db.query(`select count(*)::int as count from pickup_verification_sessions where created_at>=now()-interval '30 days'`).catch(()=>({rows:[{count:0}]} as any)),
    db.query(`select count(*)::int as count from pickup_verification_sessions where verified_at is not null and created_at>=now()-interval '30 days'`).catch(()=>({rows:[{count:0}]} as any)),
    db.query(`select count(*)::int as count from organization_domains where domain_type='custom' and status='active'`),
    db.query(`select count(distinct organization_id::text||':'||driver_person_id::text)::int as count from driver_requirement_status where status in ('verified','approved')`),
  ]);
  const activeOrgs=Number(orgs.rows[0]?.count||0),activeDrivers=Number(drivers.rows[0]?.count||0),pickupAttempts=Number(pickupEligible.rows[0]?.count||0);
  const metric=(key:string,label:string,numerator:number,denominator:number,unit:string)=>({key,label,numerator,denominator,percent:denominator>0?Math.round(numerator/denominator*1000)/10:0,unit});
  return[
    metric('route_assist','RouteAssist enabled',Number(routeAssist.rows[0]?.count||0),activeDrivers,'active driver-org memberships'),
    metric('ai','Organizations using AI',Number(ai.rows[0]?.count||0),activeOrgs,'active organizations'),
    metric('pickup_verification','Verified Pickup completion',Number(pickupVerified.rows[0]?.count||0),pickupAttempts,'30-day pickup handshakes'),
    metric('credential_validation','Drivers with approved requirements',Number(credentialDrivers.rows[0]?.count||0),activeDrivers,'active driver-org memberships'),
    {key:'push',label:'Users with Push enabled',numerator:Number(pushUsers.rows[0]?.count||0),denominator:null,percent:null,unit:'users'},
    {key:'custom_domains',label:'Active custom domains',numerator:Number(customDomains.rows[0]?.count||0),denominator:activeOrgs,percent:activeOrgs>0?Math.round(Number(customDomains.rows[0]?.count||0)/activeOrgs*1000)/10:0,unit:'active organizations'},
  ];
}

export async function getMonthEndCostForecast(){
  const snapshot=await getPlatformCostSnapshot();
  const now=new Date();const elapsed=Math.max(1,now.getUTCDate());const daysInMonth=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,0)).getUTCDate();
  const variableToDate=snapshot.costs.aiCents+snapshot.costs.routingCents+snapshot.costs.messagingCents+snapshot.costs.rideCents+snapshot.costs.validationCents;
  const projectedVariable=Math.round(variableToDate/elapsed*daysInMonth);
  const projectedTotal=snapshot.costs.fixedCents+projectedVariable;
  const budgetCents=Number(snapshot.budget?.budget_cents||0);
  return{...snapshot,forecast:{elapsedDays:elapsed,daysInMonth,variableToDateCents:variableToDate,projectedVariableCents:projectedVariable,projectedTotalCents:projectedTotal,projectedBudgetPercent:budgetCents>0?Math.round(projectedTotal/budgetCents*1000)/10:null,remainingBudgetCents:budgetCents?budgetCents-projectedTotal:null}};
}

export async function getOrganizationCostRanking(){
  const db=dbRequired();const month=new Date().toISOString().slice(0,7)+'-01';const end=new Date(Date.UTC(new Date().getUTCFullYear(),new Date().getUTCMonth()+1,1)).toISOString().slice(0,10);
  const result=await db.query(`with orgs as (
    select id,coalesce(display_name,name) as name,coalesce(estimated_cost_per_ride_cents,25) as ride_cost,coalesce(estimated_driver_validation_cost_cents,50) as validation_cost from organizations where status='active'
  ), ride_costs as (select organization_id,count(*)::int as rides from rides where created_at>=$1::date and created_at<$2::date group by organization_id),
  validations as (select organization_id,count(distinct driver_person_id)::int as validations from driver_requirement_status where reviewed_at>=$1::date and reviewed_at<$2::date and status in ('verified','approved') group by organization_id),
  messages as (select organization_id,coalesce(sum(estimated_cost_cents),0)::numeric as cents from notification_deliveries where created_at>=$1::date and created_at<$2::date group by organization_id),
  routes as (select organization_id,coalesce(sum(estimated_cost_microusd),0)::bigint as microusd from routing_usage_daily where usage_date>=$1::date and usage_date<$2::date group by organization_id),
  ai as (select organization_id,coalesce(sum(estimated_cost_microusd),0)::bigint as microusd from ai_usage_daily where usage_date>=$1::date and usage_date<$2::date group by organization_id)
  select o.id,o.name,coalesce(r.rides,0)::int as rides,coalesce(v.validations,0)::int as validations,
    round(coalesce(m.cents,0)+coalesce(r.rides,0)*o.ride_cost+coalesce(v.validations,0)*o.validation_cost+coalesce(ro.microusd,0)/10000.0+coalesce(a.microusd,0)/10000.0)::int as estimated_cost_cents
  from orgs o left join ride_costs r on r.organization_id=o.id left join validations v on v.organization_id=o.id left join messages m on m.organization_id=o.id left join routes ro on ro.organization_id=o.id left join ai a on a.organization_id=o.id
  order by estimated_cost_cents desc,o.name limit 25`,[month,end]);
  return result.rows;
}

export async function getPlatformAnalytics(){
  const [windows,features,costForecast,organizationCosts]=await Promise.all([getUsageWindows(),getFeatureAdoptionSnapshot(),getMonthEndCostForecast(),getOrganizationCostRanking()]);
  return{generatedAt:new Date().toISOString(),windows,features,costForecast,organizationCosts};
}
