import { getDb } from "@/lib/db";
import { routeNotification } from "@/lib/notification-router";

function dbRequired(){const db=getDb();if(!db)throw new Error("Database is not configured");return db;}

type ReminderKind="24h"|"1h";
const WINDOWS:Record<ReminderKind,{targetMinutes:number;toleranceMinutes:number;notificationType:string}>={
  "24h":{targetMinutes:24*60,toleranceMinutes:45,notificationType:"reminder_24h"},
  "1h":{targetMinutes:60,toleranceMinutes:20,notificationType:"reminder_1h"},
};

async function dueRides(kind:ReminderKind){
  const db=dbRequired();const w=WINDOWS[kind];
  const result=await db.query(`select r.id,r.public_ref,r.organization_id,r.driver_person_id,r.status,
      rr.requester_person_id,rr.passenger_person_id,e.title as event_title,
      coalesce(r.scheduled_pickup_at,rr.requested_pickup_at,e.starts_at) as pickup_at,
      o.reminder_24h_enabled,o.reminder_1h_enabled
    from rides r
    join ride_requests rr on rr.id=r.ride_request_id
    join organizations o on o.id=r.organization_id
    left join events e on e.id=r.event_id
    where r.status='confirmed' and o.ride_reminders_enabled=true
      and (($1='24h' and o.reminder_24h_enabled=true) or ($1='1h' and o.reminder_1h_enabled=true))
      and coalesce(r.scheduled_pickup_at,rr.requested_pickup_at,e.starts_at) is not null
      and extract(epoch from (coalesce(r.scheduled_pickup_at,rr.requested_pickup_at,e.starts_at)-now()))/60
          between ($2::double precision-$3::double precision)
              and ($2::double precision+$3::double precision)`,[kind,w.targetMinutes,w.toleranceMinutes]);
  return result.rows;
}

async function recipients(ride:any){
  const ids=new Set<string>();
  if(ride.driver_person_id)ids.add(ride.driver_person_id);
  if(ride.requester_person_id)ids.add(ride.requester_person_id);
  const db=dbRequired();
  if(ride.passenger_person_id){
    const account=await db.query(`select 1 from user_accounts where person_id=$1 and status='active' limit 1`,[ride.passenger_person_id]);
    if(account.rowCount)ids.add(ride.passenger_person_id);
  }
  return [...ids];
}

export async function dispatchRideReminders(){
  const db=dbRequired();const summary={ridesChecked:0,attempted:0,sent:0,failed:0,skipped:0};
  for(const kind of ["24h","1h"] as ReminderKind[]){
    const rides=await dueRides(kind);summary.ridesChecked+=rides.length;
    for(const ride of rides){
      for(const personId of await recipients(ride)){
        const claimed=await db.query(`insert into ride_reminder_dispatches(ride_id,person_id,reminder_type,scheduled_for,status)
          values($1,$2,$3,$4,'pending') on conflict(ride_id,person_id,reminder_type) do nothing returning ride_id`,[ride.id,personId,kind,ride.pickup_at]);
        if(!claimed.rowCount){summary.skipped++;continue;}
        summary.attempted++;
        const when=new Date(ride.pickup_at);
        const body=kind==="24h"?`Reminder: your BandWagon ride${ride.event_title?` for ${ride.event_title}`:""} is tomorrow at ${when.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}.`:`Your BandWagon ride${ride.event_title?` for ${ride.event_title}`:""} is about 1 hour away.`;
        try{
          const result=await routeNotification({notificationType:WINDOWS[kind].notificationType,title:kind==="24h"?"Ride tomorrow":"Ride in about 1 hour",body,personId,organizationId:ride.organization_id,url:`/app/rides`});
          await db.query(`update ride_reminder_dispatches set status='sent',notification_correlation_id=$1,sent_at=now(),updated_at=now() where ride_id=$2 and person_id=$3 and reminder_type=$4`,[result.correlationId,ride.id,personId,kind]);
          summary.sent++;
        }catch(error){
          await db.query(`update ride_reminder_dispatches set status='failed',error_message=$1,updated_at=now() where ride_id=$2 and person_id=$3 and reminder_type=$4`,[error instanceof Error?error.message:"Notification failed",ride.id,personId,kind]);summary.failed++;
        }
      }
    }
  }
  return summary;
}
