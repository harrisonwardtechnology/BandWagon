import { getDb } from "@/lib/db";
import { cleanupOrganizationInfrastructure } from "@/lib/organization-infrastructure-cleanup";
import { sendEmailNotification } from "@/lib/email-send";

function dbRequired(){const db=getDb();if(!db)throw new Error('Database is not configured');return db;}

export async function processOrganizationDecommissions(limit=10){
  const db=dbRequired();const results:any[]=[];
  const work=(await db.query(`select * from organization_decommissions where status in ('quiescing','external_cleanup') order by requested_at asc limit $1`,[Math.max(1,Math.min(50,limit))])).rows;
  for(const row of work){
    try{
      const active=(await db.query(`select count(*)::int as count from rides where organization_id=$1 and status in ('confirmed','driver_en_route','arrived','picked_up')`,[row.organization_id])).rows[0]?.count||0;
      if(Number(active)>0&&row.mode!=='emergency'){
        await db.query(`update organization_decommissions set status='blocked',blockers=$2::jsonb,last_error='Active rides still exist',updated_at=now() where id=$1`,[row.id,JSON.stringify([{key:'active_rides',count:Number(active),message:'Resolve active rides before continuing decommission.'}])]);
        results.push({id:row.id,status:'blocked',activeRides:Number(active)});continue;
      }
      await db.query(`update organization_decommissions set status='external_cleanup',updated_at=now() where id=$1`,[row.id]);
      const cleanup=await cleanupOrganizationInfrastructure(row.organization_id);
      const allClean=Boolean(cleanup.ok)&&!(cleanup.monitoring as any)?.error;
      await db.query(`update organization_decommissions set external_cleanup=$2::jsonb,status=$3,last_error=$4,updated_at=now() where id=$1`,[row.id,JSON.stringify(cleanup),allClean?'retention':'external_cleanup',allClean?null:'One or more external cleanup steps require retry']);
      if(allClean){await db.query(`insert into audit_events(organization_id,action,target_type,target_id,metadata) values($1,'organization.decommission.external_cleanup_complete','organization',$1,$2::jsonb)`,[row.organization_id,JSON.stringify({decommissionId:row.id})]).catch(()=>{});}
      results.push({id:row.id,status:allClean?'retention':'external_cleanup',cleanup});
    }catch(error){const message=error instanceof Error?error.message:'Decommission cleanup failed';await db.query(`update organization_decommissions set status='external_cleanup',last_error=$2,updated_at=now() where id=$1`,[row.id,message]).catch(()=>{});results.push({id:row.id,status:'failed_attempt',error:message});}
  }
  const purged=await purgeDueOrganizationData(limit);
  return{processed:results.length,results,purged};
}

export async function purgeDueOrganizationData(limit=10){
  const db=dbRequired();const nowRows=(await db.query(`select d.* from organization_decommissions d where d.status='retention' and (d.retention_plan->>'purgeAfter')::timestamptz<=now() order by requested_at asc limit $1`,[Math.max(1,Math.min(50,limit))])).rows;const results:any[]=[];
  for(const d of nowRows){
    try{
      const members=(await db.query(`select * from organization_decommission_members where decommission_id=$1 order by created_at`,[d.id])).rows;
      for(const m of members){
        if(m.verified_email_snapshot){
          const shared=m.disposition==='remove_org_data_keep_account';
          const body=shared
            ? `${d.organization_name} has completed its removal from BandWagon. Data specific to that community has been removed. Your BandWagon account remains because it is still used by another community.`
            : `${d.organization_name} has completed its removal from BandWagon. This was your last community, so your BandWagon account and personal data are now being removed. Limited de-identified or minimum audit records may remain where required for security, legal, incident, or compliance obligations.`;
          await sendEmailNotification({to:m.verified_email_snapshot,subject:`BandWagon data removal completed - ${d.organization_name}`,body,notificationType:'organization_data_removed',urgency:'important'}).catch(()=>{});
        }
      }
      const householdIds=(await db.query(`select distinct p.household_id from organization_decommission_members dm join people p on p.id=dm.person_id where dm.decommission_id=$1 and p.household_id is not null`,[d.id])).rows.map((r:any)=>r.household_id);
      await db.query('begin');
      try{
        // Tables introduced before tenant foreign keys were normalized do not all cascade from organizations.
        await db.query(`delete from calendar_events where organization_id=$1`,[d.organization_id]).catch(()=>{});
        await db.query(`delete from google_connections where organization_id=$1`,[d.organization_id]).catch(()=>{});
        await db.query(`delete from organizations where id=$1`,[d.organization_id]);
        for(const m of members){
          if(m.disposition!=='remove_account_after_retention'||!m.person_id)continue;
          const remaining=(await db.query(`select count(*)::int as count from memberships where person_id=$1 and status in ('active','pending')`,[m.person_id])).rows[0]?.count||0;
          if(Number(remaining)===0){await db.query(`delete from people where id=$1`,[m.person_id]);}
        }
        for(const householdId of householdIds){await db.query(`delete from households h where h.id=$1 and not exists(select 1 from people p where p.household_id=h.id)`,[householdId]).catch(()=>{});}
        await db.query(`update organization_decommission_members set data_cleanup_status='completed',data_cleanup_completed_at=now(),updated_at=now() where decommission_id=$1`,[d.id]);
        await db.query(`update organization_decommissions set organization_id=null,status='completed',completed_at=now(),last_error=null,updated_at=now() where id=$1`,[d.id]);
        await db.query('commit');
      }catch(error){await db.query('rollback');throw error;}
      results.push({id:d.id,status:'completed'});
    }catch(error){const message=error instanceof Error?error.message:'Retention purge failed';await db.query(`update organization_decommissions set status='failed',last_error=$2,updated_at=now() where id=$1`,[d.id,message]).catch(()=>{});await db.query(`update organization_decommission_members set data_cleanup_status='failed',updated_at=now() where decommission_id=$1 and data_cleanup_status='scheduled'`,[d.id]).catch(()=>{});results.push({id:d.id,status:'failed',error:message});}
  }
  return{processed:results.length,results};
}
