import { getDb } from "@/lib/db";
import { routeNotification } from "@/lib/notification-router";

function dbRequired(){const db=getDb();if(!db)throw new Error("Database is not configured");return db;}

export async function processCredentialExpirations(){
  const db=dbRequired();
  const expired=await db.query(
    `update driver_requirement_status s set status='expired',updated_at=now()
     from organization_driver_requirements r
     where r.organization_id=s.organization_id and r.suspend_on_expired_credentials=true
       and s.status in ('verified','approved') and s.expires_at<current_date
     returning s.organization_id,s.driver_person_id,s.requirement_type,s.expires_at`
  );
  const upcoming=await db.query(
    `select s.organization_id,s.driver_person_id,s.requirement_type,s.expires_at,coalesce(o.display_name,o.name) as organization_name,
            (s.expires_at-current_date)::int as days_remaining
     from driver_requirement_status s join organizations o on o.id=s.organization_id
     where s.status in ('verified','approved') and s.expires_at is not null and s.expires_at between current_date and current_date+30
       and (s.expires_at-current_date)::int in (30,14,7,1,0)
     order by s.expires_at`
  );
  let notified=0;
  for(const row of upcoming.rows){
    const key=`${row.requirement_type}:${row.expires_at}:${row.days_remaining}`;
    const duplicate=await db.query(
      `select 1 from audit_events where organization_id=$1 and actor_person_id=$2 and action='credential_expiration_notified'
       and metadata->>'key'=$3 and occurred_at>now()-interval '36 hours' limit 1`,[row.organization_id,row.driver_person_id,key]
    );
    if(duplicate.rowCount)continue;
    const label=String(row.requirement_type).replaceAll("_"," ");
    await routeNotification({notificationType:"credential_expiring",title:"BandWagon Driver Credential",body:`Your ${label} for ${row.organization_name} ${row.days_remaining===0?"expires today":`expires in ${row.days_remaining} days`}. Update it in BandWagon to keep your driver eligibility current.`,personId:row.driver_person_id,organizationId:row.organization_id,url:"/app/driver/credentials"}).catch(()=>null);
    await db.query(`insert into audit_events (organization_id,actor_person_id,action,target_type,target_id,metadata) values ($1,$2,'credential_expiration_notified','person',$2,$3::jsonb)`,[row.organization_id,row.driver_person_id,JSON.stringify({key,requirementType:row.requirement_type,expiresAt:row.expires_at,daysRemaining:row.days_remaining})]);notified++;
  }
  return {expired:expired.rowCount||0,upcoming:upcoming.rowCount||0,notified};
}
