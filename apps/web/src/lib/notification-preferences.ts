import { getDb } from "@/lib/db";
import type { SessionIdentity } from "@/lib/auth";

function dbRequired(){const db=getDb();if(!db)throw new Error("Database is not configured");return db;}

const DEFAULTS={push_enabled:true,email_enabled:true,sms_enabled:true,sms_for_critical_only:true,reminder_push_enabled:true,reminder_email_enabled:false,reminder_sms_enabled:false};

export async function getNotificationPreferences(identity:SessionIdentity,organizationId?:string|null){
  const db=dbRequired();
  if(organizationId&&!identity.organizationIds.includes(organizationId))throw new Error("You are not a member of that organization");
  const pref=await db.query(`select push_enabled,email_enabled,sms_enabled,sms_for_critical_only,reminder_push_enabled,reminder_email_enabled,reminder_sms_enabled,updated_at from notification_preferences where person_id=$1 and organization_id is not distinct from $2 limit 1`,[identity.personId,organizationId||null]);
  const deliveries=await db.query(`select channel,status,count(*)::int as count,coalesce(sum(estimated_cost_cents),0)::numeric as estimated_cost_cents from notification_deliveries where person_id=$1 and created_at>=now()-interval '30 days' group by channel,status order by channel,status`,[identity.personId]);
  const recent=await db.query(`select notification_type,channel,status,estimated_cost_cents,created_at,delivered_at,failed_at from notification_deliveries where person_id=$1 order by created_at desc limit 20`,[identity.personId]);
  return {preferences:{...DEFAULTS,...(pref.rows[0]||{})},deliverySummary:deliveries.rows,recentDeliveries:recent.rows};
}

export async function updateNotificationPreferences(identity:SessionIdentity,input:{organizationId?:string|null;pushEnabled?:boolean;emailEnabled?:boolean;smsEnabled?:boolean;smsForCriticalOnly?:boolean;reminderPushEnabled?:boolean;reminderEmailEnabled?:boolean;reminderSmsEnabled?:boolean}){
  const db=dbRequired();const org=input.organizationId||null;if(org&&!identity.organizationIds.includes(org))throw new Error("You are not a member of that organization");
  const current=(await getNotificationPreferences(identity,org)).preferences;
  const values={push_enabled:input.pushEnabled??current.push_enabled,email_enabled:input.emailEnabled??current.email_enabled,sms_enabled:input.smsEnabled??current.sms_enabled,sms_for_critical_only:input.smsForCriticalOnly??current.sms_for_critical_only,reminder_push_enabled:input.reminderPushEnabled??current.reminder_push_enabled,reminder_email_enabled:input.reminderEmailEnabled??current.reminder_email_enabled,reminder_sms_enabled:input.reminderSmsEnabled??current.reminder_sms_enabled};
  if(org){
    await db.query(`insert into notification_preferences(person_id,organization_id,push_enabled,email_enabled,sms_enabled,sms_for_critical_only,reminder_push_enabled,reminder_email_enabled,reminder_sms_enabled) values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(person_id,organization_id) do update set push_enabled=excluded.push_enabled,email_enabled=excluded.email_enabled,sms_enabled=excluded.sms_enabled,sms_for_critical_only=excluded.sms_for_critical_only,reminder_push_enabled=excluded.reminder_push_enabled,reminder_email_enabled=excluded.reminder_email_enabled,reminder_sms_enabled=excluded.reminder_sms_enabled,updated_at=now()`,[identity.personId,org,values.push_enabled,values.email_enabled,values.sms_enabled,values.sms_for_critical_only,values.reminder_push_enabled,values.reminder_email_enabled,values.reminder_sms_enabled]);
  }else{
    const existing=await db.query(`select id from notification_preferences where person_id=$1 and organization_id is null limit 1`,[identity.personId]);
    if(existing.rowCount)await db.query(`update notification_preferences set push_enabled=$1,email_enabled=$2,sms_enabled=$3,sms_for_critical_only=$4,reminder_push_enabled=$5,reminder_email_enabled=$6,reminder_sms_enabled=$7,updated_at=now() where id=$8`,[values.push_enabled,values.email_enabled,values.sms_enabled,values.sms_for_critical_only,values.reminder_push_enabled,values.reminder_email_enabled,values.reminder_sms_enabled,existing.rows[0].id]);
    else await db.query(`insert into notification_preferences(person_id,organization_id,push_enabled,email_enabled,sms_enabled,sms_for_critical_only,reminder_push_enabled,reminder_email_enabled,reminder_sms_enabled) values($1,null,$2,$3,$4,$5,$6,$7,$8)`,[identity.personId,values.push_enabled,values.email_enabled,values.sms_enabled,values.sms_for_critical_only,values.reminder_push_enabled,values.reminder_email_enabled,values.reminder_sms_enabled]);
  }
  return getNotificationPreferences(identity,org);
}
