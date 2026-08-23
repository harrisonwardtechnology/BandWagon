import { getDb } from "@/lib/db";
import { sendEmailNotification } from "@/lib/email-send";

const STATUSES=new Set(['new','triage','needs_info','accepted','duplicate','resolved','closed']);
const BOUNTY_STATUSES=new Set(['not_reviewed','eligible','ineligible','awarded','paid']);

export async function listSecurityReports(input:{status?:string|null;severity?:string|null;limit?:number}){
  const db=getDb();if(!db)throw new Error('Database is not configured');
  const params:any[]=[];const where:string[]=[];
  if(input.status&&input.status!=='all'){params.push(input.status);where.push(`sr.status=$${params.length}`);}
  if(input.severity&&input.severity!=='all'){params.push(input.severity);where.push(`sr.severity=$${params.length}`);}
  params.push(Math.max(1,Math.min(250,Number(input.limit||100))));
  const result=await db.query(`select sr.*,p.display_name as assigned_to_name,
    (select count(*) from security_report_events e where e.security_report_id=sr.id)::int as event_count
    from security_reports sr
    left join user_accounts ua on ua.id=sr.assigned_to_user_account_id
    left join people p on p.id=ua.person_id
    ${where.length?'where '+where.join(' and '):''}
    order by case sr.severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 4 end,
      case sr.status when 'new' then 0 when 'triage' then 1 when 'needs_info' then 2 when 'accepted' then 3 else 4 end,
      sr.created_at desc limit $${params.length}`,params);
  return result.rows;
}

export async function getSecurityReport(reportId:string){
  const db=getDb();if(!db)throw new Error('Database is not configured');
  const report=(await db.query(`select sr.*,p.display_name as assigned_to_name from security_reports sr left join user_accounts ua on ua.id=sr.assigned_to_user_account_id left join people p on p.id=ua.person_id where sr.id=$1 limit 1`,[reportId])).rows[0];
  if(!report)throw new Error('Security report not found');
  const events=await db.query(`select e.*,p.display_name as actor_name from security_report_events e left join user_accounts ua on ua.id=e.actor_user_account_id left join people p on p.id=ua.person_id where e.security_report_id=$1 order by e.created_at desc`,[reportId]);
  return{report,events:events.rows};
}

export async function updateSecurityReport(input:{reportId:string;actorUserAccountId:string;status?:string|null;bountyStatus?:string|null;bountyAmountCents?:number|null;assignToSelf?:boolean;internalNote?:string|null;publicMessage?:string|null;remediationReference?:string|null}){
  const db=getDb();if(!db)throw new Error('Database is not configured');
  const current=(await db.query(`select * from security_reports where id=$1 limit 1`,[input.reportId])).rows[0];
  if(!current)throw new Error('Security report not found');
  const status=input.status||current.status;if(!STATUSES.has(status))throw new Error('Invalid report status');
  const bountyStatus=input.bountyStatus||current.bounty_status;if(!BOUNTY_STATUSES.has(bountyStatus))throw new Error('Invalid bounty status');
  const bountyAmount=input.bountyAmountCents==null?current.bounty_amount_cents:Math.max(0,Math.round(input.bountyAmountCents));
  const assignee=input.assignToSelf?input.actorUserAccountId:current.assigned_to_user_account_id;
  const internalNote=String(input.internalNote||'').trim().slice(0,12000)||null;
  const publicMessage=String(input.publicMessage||'').trim().slice(0,12000)||null;
  const remediationReference=input.remediationReference==null?current.remediation_reference:String(input.remediationReference||'').trim().slice(0,1000)||null;
  await db.query('begin');
  try{
    await db.query(`update security_reports set status=$2,bounty_status=$3,bounty_amount_cents=$4,assigned_to_user_account_id=$5,
      acknowledged_at=case when acknowledged_at is null and $2<>'new' then now() else acknowledged_at end,
      first_response_at=case when first_response_at is null and $6::boolean then now() else first_response_at end,
      resolved_at=case when $2='resolved' then coalesce(resolved_at,now()) else resolved_at end,
      closed_at=case when $2='closed' then coalesce(closed_at,now()) else closed_at end,
      remediation_reference=$7,updated_at=now() where id=$1`,[input.reportId,status,bountyStatus,bountyAmount,assignee,Boolean(publicMessage),remediationReference]);
    await db.query(`insert into security_report_events(security_report_id,actor_user_account_id,event_type,public_message,internal_note,from_status,to_status,metadata) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,[input.reportId,input.actorUserAccountId,status!==current.status?'status_changed':publicMessage?'reporter_contacted':internalNote?'note_added':'updated',publicMessage,internalNote,current.status,status,JSON.stringify({bountyStatus,bountyAmountCents:bountyAmount,assignedToSelf:Boolean(input.assignToSelf),remediationReference})]);
    await db.query(`insert into audit_events(actor_person_id,action,target_type,target_id,metadata) select ua.person_id,'security_report.updated','security_report',$1,$2::jsonb from user_accounts ua where ua.id=$3`,[input.reportId,JSON.stringify({trackingId:current.tracking_id,fromStatus:current.status,toStatus:status,bountyStatus}),input.actorUserAccountId]).catch(()=>{});
    await db.query('commit');
  }catch(error){await db.query('rollback');throw error;}
  if(publicMessage){
    await sendEmailNotification({to:current.contact_email,subject:`BandWagon security report ${current.tracking_id}`,body:`Update from BandWagon Security\n\n${publicMessage}\n\nTracking ID: ${current.tracking_id}\n\nDo not send sensitive evidence by ordinary email. Use https://secret.harrisonward.com and reference the tracking ID.`,notificationType:'security_report_update',urgency:current.severity==='critical'?'critical':'important'}).catch(()=>{});
  }
  return getSecurityReport(input.reportId);
}
