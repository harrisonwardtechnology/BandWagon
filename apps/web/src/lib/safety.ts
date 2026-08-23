import { getDb } from "@/lib/db";
import { encryptSensitive } from "@/lib/data-security";
import type { SessionIdentity } from "@/lib/auth";
import { routeNotification } from "@/lib/notification-router";

function dbRequired() {
  const db=getDb();
  if(!db) throw new Error("Database is not configured");
  return db;
}

async function rideContext(rideId:string) {
  const db=dbRequired();
  const result=await db.query(
    `select r.id,r.public_ref,r.organization_id,r.driver_person_id,r.status,
            rr.requester_person_id,rr.passenger_person_id,e.title as event_title,
            coalesce(o.display_name,o.name) as organization_name,o.safety_contact_enabled,o.safety_settings
     from rides r
     join ride_requests rr on rr.id=r.ride_request_id
     join organizations o on o.id=r.organization_id
     left join events e on e.id=r.event_id
     where r.id=$1`,[rideId]
  );
  if(!result.rowCount) throw new Error("Ride not found");
  return result.rows[0];
}

async function canUseSafety(identity:SessionIdentity,ride:any) {
  if([ride.driver_person_id,ride.requester_person_id,ride.passenger_person_id].includes(identity.personId)) return true;
  const db=dbRequired();
  const guardian=await db.query(
    `select 1 from guardian_relationships where guardian_person_id=$1 and minor_person_id=$2 limit 1`,
    [identity.personId,ride.passenger_person_id]
  );
  return Boolean(guardian.rowCount);
}

export async function triggerSafetyAlert(identity:SessionIdentity,input:{
  rideId:string;
  alertType?:"help"|"guardian_alert"|"emergency_assist"|"incident";
  message?:string|null;
  latitude?:number|null;
  longitude?:number|null;
  generalizedArea?:string|null;
}) {
  const db=dbRequired();
  const ride=await rideContext(input.rideId);
  if(!(await canUseSafety(identity,ride))) throw new Error("You are not part of this ride's safety circle");
  const alertType=input.alertType || "help";
  const created=await db.query(
    `insert into safety_alerts
      (organization_id,ride_id,triggered_by_person_id,alert_type,message,latitude_ciphertext,longitude_ciphertext,generalized_area,metadata)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) returning *`,
    [ride.organization_id,ride.id,identity.personId,alertType,input.message?.trim()||null,
     input.latitude==null?null:encryptSensitive(String(input.latitude)),
     input.longitude==null?null:encryptSensitive(String(input.longitude)),
     input.generalizedArea?.trim()||null,
     JSON.stringify({rideStatus:ride.status,eventTitle:ride.event_title||null})]
  );
  const alert=created.rows[0];

  const recipientMap=new Map<string,string>();
  if(ride.requester_person_id!==identity.personId) recipientMap.set(ride.requester_person_id,"requester");
  if(ride.driver_person_id!==identity.personId) recipientMap.set(ride.driver_person_id,"driver");
  const guardians=await db.query(`select guardian_person_id from guardian_relationships where minor_person_id=$1`,[ride.passenger_person_id]);
  for(const row of guardians.rows) if(row.guardian_person_id!==identity.personId) recipientMap.set(row.guardian_person_id,"guardian");
  if(ride.safety_contact_enabled) {
    const configured=Array.isArray(ride.safety_settings?.contactPersonIds)?ride.safety_settings.contactPersonIds:[];
    for(const personId of configured) if(typeof personId==="string"&&personId!==identity.personId) recipientMap.set(personId,"org_safety");
  }

  for(const [personId,role] of recipientMap) {
    const correlationId=`safety-${alert.id}-${personId}`;
    await db.query(
      `insert into safety_alert_recipients (safety_alert_id,person_id,recipient_role,notification_correlation_id)
       values ($1,$2,$3,$4) on conflict do nothing`,[alert.id,personId,role,correlationId]
    );
    const result=await routeNotification({
      notificationType:"safety_alert",
      title:"BandWagon Safety Alert",
      body:`A safety alert was triggered during ${ride.event_title||"an active ride"}. Open BandWagon for ride details. If there is an emergency, call 911.`,
      personId,organizationId:ride.organization_id,url:"/app/safety",correlationId,forceUrgency:"critical",
    }).catch(()=>null);
    if(result) await db.query(`update safety_alert_recipients set notified_at=now() where safety_alert_id=$1 and person_id=$2`,[alert.id,personId]);
  }

  await db.query(
    `insert into audit_events (organization_id,actor_person_id,action,target_type,target_id,metadata)
     values ($1,$2,'safety_alert_triggered','safety_alert',$3,$4::jsonb)`,
    [ride.organization_id,identity.personId,alert.id,JSON.stringify({alertType,rideId:ride.id})]
  );
  return { alert,recipientCount:recipientMap.size };
}

export async function listMySafetyContext(identity:SessionIdentity) {
  const db=dbRequired();
  const rides=await db.query(
    `select distinct r.id,r.public_ref,r.status,r.organization_id,e.title as event_title,
            d.display_name as driver_name,p.display_name as passenger_name
     from rides r
     join ride_requests rr on rr.id=r.ride_request_id
     join people d on d.id=r.driver_person_id
     join people p on p.id=rr.passenger_person_id
     left join events e on e.id=r.event_id
     where r.status not in ('completed','cancelled','no_show') and (
       r.driver_person_id=$1 or rr.requester_person_id=$1 or rr.passenger_person_id=$1 or
       exists(select 1 from guardian_relationships gr where gr.guardian_person_id=$1 and gr.minor_person_id=rr.passenger_person_id)
     ) order by r.created_at desc limit 25`,[identity.personId]
  );
  const alerts=await db.query(
    `select sa.id,sa.ride_id,sa.alert_type,sa.status,sa.message,sa.generalized_area,sa.created_at,
            p.display_name as triggered_by,e.title as event_title
     from safety_alerts sa
     join people p on p.id=sa.triggered_by_person_id
     left join rides r on r.id=sa.ride_id left join events e on e.id=r.event_id
     where sa.triggered_by_person_id=$1 or exists(
       select 1 from safety_alert_recipients sr where sr.safety_alert_id=sa.id and sr.person_id=$1
     ) order by sa.created_at desc limit 50`,[identity.personId]
  );
  return { rides:rides.rows,alerts:alerts.rows };
}

export async function resolveSafetyAlert(identity:SessionIdentity,alertId:string) {
  const db=dbRequired();
  const row=await db.query(`select * from safety_alerts where id=$1`,[alertId]);
  if(!row.rowCount) throw new Error("Safety alert not found");
  const alert=row.rows[0];
  const admin=await db.query(
    `select 1 from memberships where organization_id=$1 and person_id=$2 and status='active' and group_id is null and role in ('owner','admin','manager') limit 1`,
    [alert.organization_id,identity.personId]
  );
  const recipient=await db.query(`select 1 from safety_alert_recipients where safety_alert_id=$1 and person_id=$2 limit 1`,[alertId,identity.personId]);
  if(alert.triggered_by_person_id!==identity.personId&&!admin.rowCount&&!recipient.rowCount) throw new Error("You cannot resolve this safety alert");
  return (await db.query(
    `update safety_alerts set status='resolved',resolved_by_person_id=$1,resolved_at=now(),updated_at=now()
     where id=$2 and status<>'resolved' returning *`,[identity.personId,alertId]
  )).rows[0]||alert;
}
