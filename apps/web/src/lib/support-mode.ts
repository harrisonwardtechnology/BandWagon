import crypto from "node:crypto";
import { getDb } from "@/lib/db";
import { lookupHash } from "@/lib/data-security";

function dbRequired(){const db=getDb();if(!db)throw new Error("Database is not configured");return db;}

const ORG_SUPPORT_ROLES=new Set(['owner','admin','manager']);
const PLATFORM_SUPPORT_ROLES=new Set(['owner','support']);
const PLATFORM_VIEW_ROLES=new Set(['owner','support','readonly']);

export async function getSupportAccess(operatorUserAccountId:string){
  const db=dbRequired();
  const operator=await db.query(`select ua.platform_role,ua.person_id,p.display_name from user_accounts ua join people p on p.id=ua.person_id where ua.id=$1 and ua.status='active' and p.status='active'`,[operatorUserAccountId]);
  if(!operator.rowCount)throw new Error("Operator account is unavailable");
  const row=operator.rows[0];
  const orgs=await db.query(`select o.id,coalesce(o.display_name,o.name) as name,o.slug,m.role from memberships m join organizations o on o.id=m.organization_id where m.person_id=$1 and m.group_id is null and m.status='active' and o.status='active' and m.role in ('owner','admin','manager') order by name`,[row.person_id]);
  const platformRole=row.platform_role||null;
  return {
    operatorPersonId:row.person_id,
    operatorDisplayName:row.display_name,
    platformRole,
    platformView:Boolean(platformRole&&PLATFORM_VIEW_ROLES.has(platformRole)),
    platformStart:Boolean(platformRole&&PLATFORM_SUPPORT_ROLES.has(platformRole)),
    organizations:orgs.rows,
  };
}

export async function createSupportSession(input:{operatorUserAccountId:string;targetUserAccountId:string;targetOrganizationId?:string|null;reason:string;mode?:'view'|'assist';minutes?:number}){
  const db=dbRequired();const reason=input.reason.trim();if(reason.length<5)throw new Error("Support reason must be at least 5 characters");
  const access=await getSupportAccess(input.operatorUserAccountId);
  const target=await db.query(`select ua.id,p.display_name from user_accounts ua join people p on p.id=ua.person_id where ua.id=$1 and ua.status='active' and p.status='active'`,[input.targetUserAccountId]);
  if(!target.rowCount)throw new Error("Target user account is unavailable");
  const mode=input.mode||'view';

  if(access.platformStart){
    if(mode==='assist'&&access.platformRole!=='owner')throw new Error("Only a platform owner can start AssistAs mode");
  }else{
    if(mode!=='view')throw new Error("Organization Support View is read-only");
    if(!input.targetOrganizationId)throw new Error("Organization Support View must be scoped to an organization");
    if(!access.organizations.some((o:any)=>o.id===input.targetOrganizationId&&ORG_SUPPORT_ROLES.has(o.role)))throw new Error("Organization administrator access is required");
  }

  if(input.targetOrganizationId){
    const member=await db.query(`select 1 from memberships m join user_accounts ua on ua.person_id=m.person_id where ua.id=$1 and m.organization_id=$2 and m.status='active' limit 1`,[input.targetUserAccountId,input.targetOrganizationId]);
    if(!member.rowCount)throw new Error("Target user is not active in that organization");
  }

  if(!access.platformStart&&!input.targetOrganizationId)throw new Error("Organization Support View cannot access a user's other organizations");

  const minutes=Math.max(5,Math.min(60,Number(input.minutes||30)));const token=crypto.randomBytes(32).toString('base64url');
  await db.query(`update platform_support_sessions set status='ended',ended_at=now(),ended_by_user_account_id=$1 where operator_user_account_id=$1 and status='active'`,[input.operatorUserAccountId]);
  const session=(await db.query(`insert into platform_support_sessions(operator_user_account_id,target_user_account_id,target_organization_id,mode,reason,token_hash,expires_at,metadata) values($1,$2,$3,$4,$5,$6,now()+($7||' minutes')::interval,$8::jsonb) returning *`,[input.operatorUserAccountId,input.targetUserAccountId,input.targetOrganizationId||null,mode,reason,lookupHash(token),String(minutes),JSON.stringify({scope:access.platformStart?'platform':'organization',operatorRole:access.platformStart?access.platformRole:access.organizations.find((o:any)=>o.id===input.targetOrganizationId)?.role||null})])).rows[0];
  await db.query(`insert into platform_support_session_events(support_session_id,operator_user_account_id,event_type,metadata) values($1,$2,'started',$3::jsonb)`,[session.id,input.operatorUserAccountId,JSON.stringify({targetUserAccountId:input.targetUserAccountId,targetOrganizationId:input.targetOrganizationId||null,mode,reason,minutes,scope:access.platformStart?'platform':'organization'})]);
  return {token,session,targetDisplayName:target.rows[0].display_name};
}

export async function endSupportSession(input:{operatorUserAccountId:string;token?:string|null}){
  const db=dbRequired();let result;
  if(input.token){result=await db.query(`update platform_support_sessions set status='ended',ended_at=now(),ended_by_user_account_id=$1 where operator_user_account_id=$1 and token_hash=$2 and status='active' returning *`,[input.operatorUserAccountId,lookupHash(input.token)]);}
  else{result=await db.query(`update platform_support_sessions set status='ended',ended_at=now(),ended_by_user_account_id=$1 where operator_user_account_id=$1 and status='active' returning *`,[input.operatorUserAccountId]);}
  for(const row of result.rows){await db.query(`insert into platform_support_session_events(support_session_id,operator_user_account_id,event_type) values($1,$2,'ended')`,[row.id,input.operatorUserAccountId]).catch(()=>{});}
  return result.rows;
}

export async function findSupportTargets(query:string,organizationIds?:string[]|null){
  const db=dbRequired();const q=query.trim();if(q.length<2)return[];
  if(organizationIds?.length){
    return (await db.query(`select ua.id as user_account_id,p.id as person_id,p.display_name,p.person_type,coalesce(json_agg(distinct jsonb_build_object('id',o.id,'name',coalesce(o.display_name,o.name),'slug',o.slug)) filter(where o.id is not null),'[]'::json) as organizations from user_accounts ua join people p on p.id=ua.person_id join memberships m on m.person_id=p.id and m.status='active' and m.group_id is null join organizations o on o.id=m.organization_id and o.id=any($2::uuid[]) left join emails e on e.person_id=p.id where ua.status='active' and p.status='active' and (p.display_name ilike $1 or e.normalized_email ilike $1) group by ua.id,p.id,p.display_name,p.person_type order by p.display_name limit 25`,[`%${q}%`,organizationIds])).rows;
  }
  return (await db.query(`select ua.id as user_account_id,p.id as person_id,p.display_name,p.person_type,coalesce(json_agg(distinct jsonb_build_object('id',o.id,'name',coalesce(o.display_name,o.name),'slug',o.slug)) filter(where o.id is not null),'[]'::json) as organizations from user_accounts ua join people p on p.id=ua.person_id left join memberships m on m.person_id=p.id and m.status='active' and m.group_id is null left join organizations o on o.id=m.organization_id left join emails e on e.person_id=p.id where ua.status='active' and p.status='active' and (p.display_name ilike $1 or e.normalized_email ilike $1) group by ua.id,p.id,p.display_name,p.person_type order by p.display_name limit 25`,[`%${q}%`])).rows;
}

export async function listSupportHistory(limit=50,organizationIds?:string[]|null){
  const db=dbRequired();const capped=Math.max(1,Math.min(200,limit));
  if(organizationIds?.length){
    return(await db.query(`select ss.id,ss.mode,ss.reason,ss.status,ss.started_at,ss.expires_at,ss.ended_at,op.display_name as operator_name,tp.display_name as target_name,coalesce(o.display_name,o.name) as organization_name from platform_support_sessions ss join user_accounts oua on oua.id=ss.operator_user_account_id join people op on op.id=oua.person_id join user_accounts tua on tua.id=ss.target_user_account_id join people tp on tp.id=tua.person_id left join organizations o on o.id=ss.target_organization_id where ss.target_organization_id=any($2::uuid[]) order by ss.started_at desc limit $1`,[capped,organizationIds])).rows;
  }
  return(await db.query(`select ss.id,ss.mode,ss.reason,ss.status,ss.started_at,ss.expires_at,ss.ended_at,op.display_name as operator_name,tp.display_name as target_name,coalesce(o.display_name,o.name) as organization_name from platform_support_sessions ss join user_accounts oua on oua.id=ss.operator_user_account_id join people op on op.id=oua.person_id join user_accounts tua on tua.id=ss.target_user_account_id join people tp on tp.id=tua.person_id left join organizations o on o.id=ss.target_organization_id order by ss.started_at desc limit $1`,[capped])).rows;
}
