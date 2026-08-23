import { getDb } from "@/lib/db";
import { sendEmailNotification } from "@/lib/email-send";

const THRESHOLDS=[50,75,90,95,100] as const;
function dbRequired(){const db=getDb();if(!db)throw new Error("Database is not configured");return db;}
function monthStart(value?:string|Date){const d=value?new Date(value):new Date();return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1)).toISOString().slice(0,10);}

export async function setPlatformBudget(input:{budgetMonth?:string;budgetCents:number;fixedMonthlyCostCents?:number;alertRecipients:string[];enabled?:boolean}){
 const db=dbRequired(),month=monthStart(input.budgetMonth),budget=Math.max(1,Math.round(input.budgetCents)),fixed=Math.max(0,Math.round(input.fixedMonthlyCostCents||0)),recipients=[...new Set((input.alertRecipients||[]).map(v=>v.trim().toLowerCase()).filter(Boolean))];
 return (await db.query(`insert into platform_cost_budgets(budget_month,budget_cents,fixed_monthly_cost_cents,alert_recipients,enabled,updated_at) values($1,$2,$3,$4,$5,now()) on conflict(budget_month) do update set budget_cents=excluded.budget_cents,fixed_monthly_cost_cents=excluded.fixed_monthly_cost_cents,alert_recipients=excluded.alert_recipients,enabled=excluded.enabled,updated_at=now() returning *`,[month,budget,fixed,recipients,input.enabled!==false])).rows[0];
}

export async function getPlatformCostSnapshot(budgetMonth?:string){
 const db=dbRequired(),month=monthStart(budgetMonth),start=new Date(`${month}T00:00:00Z`),end=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,1));
 const [budget,ai,routing,messaging,rides,validation,orgCosts]=await Promise.all([
  db.query(`select * from platform_cost_budgets where budget_month=$1`,[month]),
  db.query(`select coalesce(sum(estimated_cost_microusd),0)::bigint as value from ai_usage_daily where usage_date >= $1::date and usage_date < $2::date`,[month,end.toISOString().slice(0,10)]),
  db.query(`select coalesce(sum(estimated_cost_microusd),0)::bigint as value from routing_usage_daily where usage_date >= $1::date and usage_date < $2::date`,[month,end.toISOString().slice(0,10)]),
  db.query(`select coalesce(sum(estimated_cost_cents),0)::numeric as value from notification_deliveries where created_at >= $1 and created_at < $2`,[start,end]),
  db.query(`select count(*)::int as count from rides where created_at >= $1 and created_at < $2`,[start,end]),
  db.query(`select count(distinct organization_id::text||':'||driver_person_id::text)::int as count from driver_requirement_status where reviewed_at >= $1 and reviewed_at < $2 and status in ('verified','approved')`,[start,end]),
  db.query(`select coalesce(avg(estimated_cost_per_ride_cents),25)::numeric as ride_cents,coalesce(avg(estimated_driver_validation_cost_cents),50)::numeric as validation_cents from organizations where status='active'`)
 ]);
 const b=budget.rows[0]||null,fixedCents=Number(b?.fixed_monthly_cost_cents||0),aiCents=Math.round(Number(ai.rows[0]?.value||0)/10000),routingCents=Math.round(Number(routing.rows[0]?.value||0)/10000),messagingCents=Math.round(Number(messaging.rows[0]?.value||0));
 const rideCents=Math.round(Number(rides.rows[0]?.count||0)*Number(orgCosts.rows[0]?.ride_cents||25)),validationCents=Math.round(Number(validation.rows[0]?.count||0)*Number(orgCosts.rows[0]?.validation_cents||50));
 const totalCents=fixedCents+aiCents+routingCents+messagingCents+rideCents+validationCents,percent=b?Math.round(totalCents/Number(b.budget_cents)*1000)/10:0;
 return{month,budget:b,costs:{fixedCents,aiCents,routingCents,messagingCents,rideCents,validationCents,totalCents},percent};
}

export async function evaluatePlatformBudget(budgetMonth?:string){
 const db=dbRequired(),snapshot=await getPlatformCostSnapshot(budgetMonth),budget=snapshot.budget;if(!budget?.enabled)return{...snapshot,alerts:[]};
 const crossed=THRESHOLDS.filter(t=>snapshot.percent>=t),alerts:any[]=[];
 for(const threshold of crossed){
  const inserted=await db.query(`insert into platform_cost_budget_alerts(budget_id,threshold_percent,observed_cost_cents,budget_cents,status) values($1,$2,$3,$4,'pending') on conflict(budget_id,threshold_percent) do nothing returning *`,[budget.id,threshold,snapshot.costs.totalCents,budget.budget_cents]);
  if(!inserted.rowCount)continue;const alert=inserted.rows[0];let failed:string|null=null;
  for(const to of budget.alert_recipients||[]){const result=await sendEmailNotification({to,subject:`BandWagon cost alert: ${threshold}% of monthly budget`,body:`BandWagon has reached ${snapshot.percent}% of the ${snapshot.month} platform budget.\n\nBudget: $${(Number(budget.budget_cents)/100).toFixed(2)}\nEstimated spend: $${(snapshot.costs.totalCents/100).toFixed(2)}\n\nFixed infrastructure: $${(snapshot.costs.fixedCents/100).toFixed(2)}\nAI: $${(snapshot.costs.aiCents/100).toFixed(2)}\nRouting: $${(snapshot.costs.routingCents/100).toFixed(2)}\nMessaging: $${(snapshot.costs.messagingCents/100).toFixed(2)}\nRide operations: $${(snapshot.costs.rideCents/100).toFixed(2)}\nDriver validation: $${(snapshot.costs.validationCents/100).toFixed(2)}`,notificationType:'platform_budget_alert',urgency:threshold>=95?'critical':'important'});if(!result.ok)failed=result.reason||'Email failed';}
  await db.query(`update platform_cost_budget_alerts set status=$1,error_message=$2,sent_at=case when $1='sent' then now() else sent_at end where id=$3`,[failed?'failed':'sent',failed,alert.id]);alerts.push({...alert,status:failed?'failed':'sent'});
 }
 return{...snapshot,alerts};
}
