import { getDb } from "@/lib/db";
import type { SessionIdentity } from "@/lib/auth";

function dbRequired(){const db=getDb();if(!db)throw new Error("Database is not configured");return db;}
async function assertAdmin(identity:SessionIdentity,organizationId:string){const db=dbRequired();const r=await db.query(`select 1 from memberships where organization_id=$1 and person_id=$2 and group_id is null and status='active' and role in ('owner','admin','manager') limit 1`,[organizationId,identity.personId]);if(!r.rowCount)throw new Error("Organization administrator access is required");}

export async function getAdminNotificationHealth(identity:SessionIdentity,organizationId:string){
  await assertAdmin(identity,organizationId);const db=dbRequired();
  const [summary,recentFailures]=await Promise.all([
    db.query(`select channel,status,count(*)::int as count,coalesce(sum(estimated_cost_cents),0)::numeric as estimated_cost_cents from notification_deliveries where organization_id=$1 and created_at>=date_trunc('month',now()) group by channel,status order by channel,status`,[organizationId]),
    db.query(`select notification_type,channel,status,estimated_cost_cents,created_at,failed_at,metadata from notification_deliveries where organization_id=$1 and status in ('failed','undelivered') order by created_at desc limit 20`,[organizationId])
  ]);
  const rows=summary.rows.map((r:any)=>({...r,count:Number(r.count||0),estimatedCostCents:Number(r.estimated_cost_cents||0)}));
  const total=rows.reduce((s:number,r:any)=>s+r.count,0),failed=rows.filter((r:any)=>['failed','undelivered'].includes(String(r.status))).reduce((s:number,r:any)=>s+r.count,0),sms=rows.filter((r:any)=>r.channel==='sms'||r.channel==='rcs');
  const smsCount=sms.reduce((s:number,r:any)=>s+r.count,0),smsCostCents=sms.reduce((s:number,r:any)=>s+r.estimatedCostCents,0),totalCostCents=rows.reduce((s:number,r:any)=>s+r.estimatedCostCents,0);
  return{rows,total,failed,successRate:total?Math.round((total-failed)/total*100):100,smsCount,smsCostCents,totalCostCents,recentFailures:recentFailures.rows};
}
