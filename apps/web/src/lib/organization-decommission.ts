import crypto from "node:crypto";
import { getDb } from "@/lib/db";
import { routeNotification } from "@/lib/notification-router";
import { lookupHash } from "@/lib/data-security";

async function count(db:any,sql:string,params:any[]){
  try{const r=await db.query(sql,params);return Number(r.rows?.[0]?.count||0);}catch{return 0;}
}

export async function previewOrganizationDecommission(organizationId:string){
  const db=getDb();if(!db)throw new Error("Database is not configured");
  const orgResult=await db.query(`select id,name,display_name,slug,status,tenant_hostname from organizations where id=$1 limit 1`,[organizationId]);
  const organization=orgResult.rows[0];if(!organization)throw new Error("Organization not found");
  const [activeRideCount,memberCount,customDomainCount,pendingRideRequestCount]=await Promise.all([
    count(db,`select count(*) from rides where organization_id=$1 and status in ('confirmed','driver_en_route','arrived','picked_up')`,[organizationId]),
    count(db,`select count(*) from memberships where organization_id=$1 and status in ('active','pending')`,[organizationId]),
    count(db,`select count(*) from organization_domains where organization_id=$1 and domain_type='custom' and status <> 'removed'`,[organizationId]),
    count(db,`select count(*) from ride_requests where organization_id=$1 and status in ('open','matched')`,[organizationId]),
  ]);
  const domains=await db.query(`select id,hostname,domain_type,status,is_primary,setup_mode,setup_provider,setup_provider_session_id,cloudflare_custom_hostname_id from organization_domains where organization_id=$1 order by is_primary desc,created_at`,[organizationId]);
  const members=await db.query(`select distinct p.id,p.display_name,
    coalesce((select normalized_email from emails e where e.person_id=p.id and e.verified_at is not null order by e.verified_at desc limit 1),'') as email,
    (select count(distinct m2.organization_id) from memberships m2 where m2.person_id=p.id and m2.organization_id<>$1 and m2.status in ('active','pending'))::int as other_active_org_count
    from memberships m join people p on p.id=m.person_id
    where m.organization_id=$1 and m.status in ('active','pending') order by p.display_name`,[organizationId]);
  const blockers:any[]=[];
  if(activeRideCount>0)blockers.push({key:"active_rides",count:activeRideCount,message:"Active rides must be resolved before standard decommission."});
  if(pendingRideRequestCount>0)blockers.push({key:"open_requests",count:pendingRideRequestCount,message:"Open or matched ride requests will be closed during decommission."});
  return{organization,counts:{activeRideCount,memberCount,customDomainCount,pendingRideRequestCount},domains:domains.rows,members:members.rows.map((m:any)=>({...m,disposition:Number(m.other_active_org_count)>0?"remove_org_data_keep_account":"remove_account_after_retention"})),blockers};
}

export async function createOrganizationDecommissionConfirmation(input:{organizationId:string;confirmation:string;reason:string;emergency?:boolean;requestedByPersonId:string;requestedByPlatformRole?:string|null}){
  const db=getDb();if(!db)throw new Error("Database is not configured");
  const preview=await previewOrganizationDecommission(input.organizationId);
  if(String(input.confirmation||"").trim().toLowerCase()!==String(preview.organization.slug||"").trim().toLowerCase())throw new Error(`Type ${preview.organization.slug} to confirm decommission`);
  if(!input.reason?.trim())throw new Error("A decommission reason is required");
  if(preview.counts.activeRideCount>0&&!input.emergency)throw new Error("Active rides block standard decommission. Resolve them first or use the Platform Owner emergency process.");
  const token=crypto.randomBytes(32).toString("base64url");
  const code=String(crypto.randomInt(0,1000000)).padStart(6,"0");
  const expiresAt=new Date(Date.now()+15*60*1000);
  await db.query(`update organization_decommission_confirmations set status='cancelled',updated_at=now() where organization_id=$1 and requested_by_person_id=$2 and status='pending'`,[input.organizationId,input.requestedByPersonId]);
  const row=(await db.query(`insert into organization_decommission_confirmations
    (organization_id,requested_by_person_id,requested_by_platform_role,reason,emergency,typed_confirmation,token_hash,code_hash,expires_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id,organization_id,status,expires_at`,[
    input.organizationId,input.requestedByPersonId,input.requestedByPlatformRole||null,input.reason.trim(),Boolean(input.emergency),input.confirmation.trim(),lookupHash(token),lookupHash(code),expiresAt
  ])).rows[0];
  const organizationName=preview.organization.display_name||preview.organization.name;
  const base=(process.env.PUBLIC_APP_URL||process.env.NEXT_PUBLIC_APP_URL||"https://bandwagon.harrisonward.net").replace(/\/$/,"");
  const confirmationUrl=`${base}/organization-decommission/confirm?token=${encodeURIComponent(token)}`;
  const delivery=await routeNotification({notificationType:"organization_decommission_confirmation",title:`Confirm removal of ${organizationName}`,body:`A request was made to remove ${organizationName} from BandWagon. Confirmation code: ${code}. Or confirm using this secure link: ${confirmationUrl}. This expires in 15 minutes. If you did not request this, do not confirm it and contact BandWagon Support.`,url:confirmationUrl,personId:input.requestedByPersonId,organizationId:input.organizationId,forceUrgency:"critical"});
  await db.query(`update organization_decommission_confirmations set delivery_result=$2::jsonb,updated_at=now() where id=$1`,[row.id,JSON.stringify(delivery)]);
  await db.query(`insert into audit_events(organization_id,actor_person_id,action,target_type,target_id,metadata) values($1,$2,'organization.decommission.confirmation_sent','organization',$1,$3::jsonb)`,[input.organizationId,input.requestedByPersonId,JSON.stringify({confirmationId:row.id,expiresAt:expiresAt.toISOString()})]);
  return{confirmationId:row.id,expiresAt:expiresAt.toISOString(),delivery:{push:Boolean(delivery.push?.accepted),email:Boolean(delivery.email?.accepted),messaging:Boolean(delivery.messaging?.accepted)}};
}

export async function confirmOrganizationDecommission(input:{token?:string;code?:string;organizationId?:string;personId?:string;channel:"email_link"|"code"}){
  const db=getDb();if(!db)throw new Error("Database is not configured");
  let result;
  if(input.token){result=await db.query(`select * from organization_decommission_confirmations where token_hash=$1 and status='pending' and expires_at>now() limit 1`,[lookupHash(input.token)]);}
  else if(input.code&&input.organizationId&&input.personId){result=await db.query(`select * from organization_decommission_confirmations where organization_id=$1 and requested_by_person_id=$2 and code_hash=$3 and status='pending' and expires_at>now() order by created_at desc limit 1`,[input.organizationId,input.personId,lookupHash(input.code)]);}
  else throw new Error("Confirmation token or code is required");
  const challenge=result.rows[0];if(!challenge)throw new Error("Confirmation is invalid or expired");
  await db.query(`update organization_decommission_confirmations set status='confirmed',confirmed_at=now(),confirmation_channel=$2,updated_at=now() where id=$1`,[challenge.id,input.channel]);
  try{
    const started=await requestOrganizationDecommission({organizationId:challenge.organization_id,confirmation:challenge.typed_confirmation,reason:challenge.reason,emergency:Boolean(challenge.emergency),requestedByPersonId:challenge.requested_by_person_id,requestedByPlatformRole:challenge.requested_by_platform_role});
    await db.query(`update organization_decommission_confirmations set status='used',used_at=now(),updated_at=now() where id=$1`,[challenge.id]);
    return started;
  }catch(error){
    await db.query(`update organization_decommission_confirmations set status='pending',confirmed_at=null,confirmation_channel=null,updated_at=now() where id=$1 and expires_at>now()`,[challenge.id]).catch(()=>{});
    throw error;
  }
}

export async function requestOrganizationDecommission(input:{organizationId:string;confirmation:string;reason:string;emergency?:boolean;requestedByPersonId?:string|null;requestedByPlatformRole?:string|null}){
  const db=getDb();if(!db)throw new Error("Database is not configured");
  const preview=await previewOrganizationDecommission(input.organizationId);
  if(String(input.confirmation||"").trim().toLowerCase()!==String(preview.organization.slug||"").trim().toLowerCase())throw new Error(`Type ${preview.organization.slug} to confirm decommission`);
  if(!input.reason?.trim())throw new Error("A decommission reason is required");
  if(preview.counts.activeRideCount>0&&!input.emergency)throw new Error("Active rides block standard decommission. Resolve them first or use the Platform Owner emergency process.");
  const retentionDays=Math.max(1,Math.min(3650,Number(process.env.ORGANIZATION_DECOMMISSION_RETENTION_DAYS||30)));
  const purgeAfter=new Date(Date.now()+retentionDays*86400000);
  const cleanup={dodomain:"pending",cloudflare:"pending",uptimeKuma:"pending",calendars:"pending",webhooks:"pending",tenantHostname:"pending"};
  const retentionPlan={retentionDays,purgeAfter:purgeAfter.toISOString(),sharedIdentityPolicy:"preserve_people_used_by_other_orgs",exclusiveIdentityPolicy:"delete_after_retention_unless_required_hold",auditPolicy:"preserve_minimum_decommission_evidence"};
  await db.query("begin");
  let decommission:any;
  try{
    const row=await db.query(`insert into organization_decommissions
      (organization_id,organization_slug,organization_name,requested_by_person_id,requested_by_platform_role,reason,mode,status,active_ride_count,member_count,custom_domain_count,external_cleanup,retention_plan,blockers,started_at)
      values ($1,$2,$3,$4,$5,$6,$7,'quiescing',$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,now()) returning *`,[
      input.organizationId,preview.organization.slug,preview.organization.display_name||preview.organization.name,input.requestedByPersonId||null,input.requestedByPlatformRole||null,input.reason.trim(),input.emergency?"emergency":"standard",preview.counts.activeRideCount,preview.counts.memberCount,preview.counts.customDomainCount,JSON.stringify(cleanup),JSON.stringify(retentionPlan),JSON.stringify(preview.blockers)
    ]);decommission=row.rows[0];
    for(const member of preview.members){
      await db.query(`insert into organization_decommission_members
        (decommission_id,organization_id,person_id,person_display_name,verified_email_snapshot,other_active_org_count,disposition,data_cleanup_status)
        values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (decommission_id,person_id) do nothing`,[
        decommission.id,input.organizationId,member.id,member.display_name,member.email||null,Number(member.other_active_org_count||0),member.disposition,member.disposition==="remove_org_data_keep_account"?"retained_shared":"scheduled"
      ]);
    }
    await db.query(`update organizations set status='decommissioning',discoverability='unlisted',decommission_requested_at=now(),decommission_started_at=now(),decommission_reason=$2,purge_after=$3,updated_at=now() where id=$1`,[input.organizationId,input.reason.trim(),purgeAfter]);
    await db.query(`update organization_domains set status='suspended',updated_at=now() where organization_id=$1`,[input.organizationId]);
    await db.query(`update ride_requests set status='cancelled' where organization_id=$1 and status='open'`,[input.organizationId]).catch(()=>{});
    await db.query(`insert into audit_events (organization_id,actor_person_id,action,target_type,target_id,metadata) values ($1,$2,'organization.decommission.requested','organization',$1,$3::jsonb)`,[input.organizationId,input.requestedByPersonId||null,JSON.stringify({reason:input.reason.trim(),mode:input.emergency?"emergency":"standard",purgeAfter:purgeAfter.toISOString(),counts:preview.counts})]);
    await db.query("commit");
  }catch(error){await db.query("rollback");throw error;}

  const organizationName=preview.organization.display_name||preview.organization.name;
  for(const member of preview.members){
    const keepsAccount=member.disposition==="remove_org_data_keep_account";
    const body=keepsAccount
      ? `${organizationName} has been removed from BandWagon. Your membership and data specific to that community are being removed. Your BandWagon account and shared profile remain because you belong to ${member.other_active_org_count} other active ${Number(member.other_active_org_count)===1?"community":"communities"}.`
      : `${organizationName} has been removed from BandWagon. Because this was your only active community, your BandWagon account and personal data are scheduled for deletion under the platform retention policy. Limited records may be retained only when required for security, legal, incident, or audit obligations.`;
    try{
      const result=await routeNotification({notificationType:"organization_removed",title:`${organizationName} has been removed from BandWagon`,body,url:"/help",personId:member.id,organizationId:input.organizationId,forceUrgency:"important"});
      await db.query(`update organization_decommission_members set notification_status=$2,notification_result=$3::jsonb,notified_at=now(),updated_at=now() where decommission_id=$1 and person_id=$4`,[decommission.id,(result.push?.accepted||result.email?.accepted||result.messaging?.accepted)?"sent":"partial",JSON.stringify(result),member.id]);
    }catch(error){
      await db.query(`update organization_decommission_members set notification_status='failed',notification_result=$2::jsonb,updated_at=now() where decommission_id=$1 and person_id=$3`,[decommission.id,JSON.stringify({error:error instanceof Error?error.message:"Notification failed"}),member.id]);
    }
  }
  await db.query(`update memberships set status='suspended' where organization_id=$1 and status in ('active','pending')`,[input.organizationId]);
  return{decommission,preview,purgeAfter:purgeAfter.toISOString()};
}

export async function listOrganizationDecommissions(organizationId?:string){
  const db=getDb();if(!db)throw new Error("Database is not configured");
  const result=organizationId?await db.query(`select * from organization_decommissions where organization_id=$1 order by requested_at desc`,[organizationId]):await db.query(`select * from organization_decommissions order by requested_at desc limit 100`);
  return result.rows;
}
