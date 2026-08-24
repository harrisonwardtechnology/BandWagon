import { getDb } from "@/lib/db";
import type { SessionIdentity } from "@/lib/auth";
import { assertIdentityOrganizationAdmin } from "@/lib/admin-access";

function dbRequired(){const db=getDb();if(!db)throw new Error("Database is not configured");return db;}

export async function getAdminNotificationHealth(identity:SessionIdentity,organizationId:string){
  await assertIdentityOrganizationAdmin(identity,organizationId,{write:false});const db=dbRequired();
  const [summary,recentFailures]=await Promise.all([
    db.query(`select channel,status,count(*)::int as count,coalesce(sum(estimated_cost_cents),0)::numeric as estimated_cost_cents from notification_deliveries where organization_id=$1 and created_at>=date_trunc('month',now()) group by channel,status order by channel,status`,[organizationId]),
    db.query(`select notification_type,channel,status,estimated_cost_cents,created_at,failed_at,metadata from notification_deliveries where organization_id=$1 and status in ('failed','undelivered') order by created_at desc limit 20`,[organizationId])
  ]);
  const rows=summary.rows.map((r:any)=>({...r,count:Number(r.count||0),estimatedCostCents:Number(r.estimated_cost_cents||0)}));
  const total=rows.reduce((s:number,r:any)=>s+r.count,0),failed=rows.filter((r:any)=>['failed','undelivered'].includes(String(r.status))).reduce((s:number,r:any)=>s+r.count,0),sms=rows.filter((r:any)=>r.channel==='sms'||r.channel==='rcs');
  const smsCount=sms.reduce((s:number,r:any)=>s+r.count,0),smsCostCents=sms.reduce((s:number,r:any)=>s+r.estimatedCostCents,0),totalCostCents=rows.reduce((s:number,r:any)=>s+r.estimatedCostCents,0);
  return{rows,total,failed,successRate:total?Math.round((total-failed)/total*100):100,smsCount,smsCostCents,totalCostCents,recentFailures:recentFailures.rows};
}
