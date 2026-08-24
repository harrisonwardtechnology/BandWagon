import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { sessionTokenHash } from "@/lib/auth-service";
import { lookupHash } from "@/lib/data-security";
import { sessionIdleDays } from "@/lib/auth-policy";

export const SESSION_COOKIE = "bw_session";
export const SUPPORT_COOKIE = "bw_support";

export type SupportModeContext = {
  supportSessionId: string;
  operatorUserAccountId: string;
  operatorPersonId: string;
  operatorDisplayName: string;
  targetUserAccountId: string;
  targetOrganizationId: string | null;
  mode: "view" | "assist";
  reason: string;
  expiresAt: string;
};

export type SessionIdentity = {
  sessionId: string;
  userAccountId: string;
  personId: string;
  displayName: string;
  personType: "adult" | "minor";
  householdId: string | null;
  organizationIds: string[];
  platformRole: "owner" | "support" | "finance" | "readonly" | null;
  supportMode?: SupportModeContext;
};

async function loadIdentityForUserAccount(userAccountId:string, sessionId:string, platformRole:string|null = null): Promise<SessionIdentity|null> {
  const db=getDb();if(!db)return null;
  const result=await db.query(
    `select ua.id as user_account_id,ua.person_id,p.display_name,p.person_type,p.household_id,
            coalesce(array_agg(distinct m.organization_id) filter(where m.status='active'),array[]::uuid[]) as organization_ids
     from user_accounts ua
     join people p on p.id=ua.person_id and p.status='active'
     left join memberships m on m.person_id=p.id
     where ua.id=$1 and ua.status='active'
       and (
         p.person_type<>'minor'
         or not exists(select 1 from managed_student_account_access msa where msa.person_id=p.id)
         or exists(
           select 1 from managed_student_account_access msa
            where msa.person_id=p.id and msa.enabled=true
              and exists(select 1 from guardian_consents gc
                          where gc.minor_person_id=p.id and gc.consent_type='platform_minor_use' and gc.status='active')
         )
       )
     group by ua.id,ua.person_id,p.display_name,p.person_type,p.household_id limit 1`,
    [userAccountId]
  );
  if(!result.rowCount)return null;const row=result.rows[0];
  return {sessionId,userAccountId:row.user_account_id,personId:row.person_id,displayName:row.display_name,personType:row.person_type,householdId:row.household_id||null,organizationIds:row.organization_ids||[],platformRole:(platformRole as SessionIdentity['platformRole'])||null};
}

export async function getBaseSessionIdentity(): Promise<SessionIdentity | null> {
  const store=await cookies();const token=store.get(SESSION_COOKIE)?.value;if(!token)return null;
  const db=getDb();if(!db)return null;
  const result=await db.query(
    `select s.id as session_id,s.user_account_id,ua.platform_role
     from auth_sessions s
     join user_accounts ua on ua.id=s.user_account_id and ua.status='active'
     where s.token_hash=$1 and s.revoked_at is null and s.expires_at>now()
       and s.last_seen_at>now()-($2||' days')::interval limit 1`,
    [sessionTokenHash(token),String(sessionIdleDays(process.env.SESSION_IDLE_DAYS))]
  );
  if(!result.rowCount)return null;const row=result.rows[0];
  await db.query(`update auth_sessions set last_seen_at=now() where id=$1 and last_seen_at<now()-interval '5 minutes'`,[row.session_id]).catch(()=>{});
  return loadIdentityForUserAccount(row.user_account_id,row.session_id,row.platform_role||null);
}

export async function getSessionIdentity(): Promise<SessionIdentity | null> {
  const base=await getBaseSessionIdentity();if(!base)return null;
  const store=await cookies();const supportToken=store.get(SUPPORT_COOKIE)?.value;if(!supportToken)return base;
  const db=getDb();if(!db)return base;
  const support=await db.query(
    `select ss.*,op.person_id as operator_person_id,op_person.display_name as operator_display_name
     from platform_support_sessions ss
     join user_accounts op on op.id=ss.operator_user_account_id
     join people op_person on op_person.id=op.person_id
     where ss.token_hash=$1 and ss.operator_user_account_id=$2 and ss.status='active' and ss.expires_at>now() limit 1`,
    [lookupHash(supportToken),base.userAccountId]
  );
  if(!support.rowCount)return base;
  const row=support.rows[0];
  const target=await loadIdentityForUserAccount(row.target_user_account_id,`support:${row.id}`,null);if(!target)return base;
  if(row.target_organization_id){
    if(!target.organizationIds.includes(row.target_organization_id))return base;
    target.organizationIds=[row.target_organization_id];
  }
  const touched=await db.query(`update platform_support_sessions set last_seen_at=now() where id=$1 and last_seen_at<now()-interval '1 minute' returning id`,[row.id]).catch(()=>({rowCount:0} as any));
  if(touched.rowCount){await db.query(`insert into platform_support_session_events(support_session_id,operator_user_account_id,event_type,metadata) values($1,$2,'viewed',$3::jsonb)`,[row.id,base.userAccountId,JSON.stringify({targetUserAccountId:row.target_user_account_id,targetOrganizationId:row.target_organization_id||null})]).catch(()=>{});}
  target.supportMode={supportSessionId:row.id,operatorUserAccountId:base.userAccountId,operatorPersonId:row.operator_person_id,operatorDisplayName:row.operator_display_name,targetUserAccountId:row.target_user_account_id,targetOrganizationId:row.target_organization_id||null,mode:row.mode,reason:row.reason,expiresAt:new Date(row.expires_at).toISOString()};
  return target;
}

export async function requireSessionIdentity(){const identity=await getSessionIdentity();if(!identity)throw new Error("Authentication required");return identity;}
export async function requireBaseSessionIdentity(){const identity=await getBaseSessionIdentity();if(!identity)throw new Error("Authentication required");return identity;}
export async function requirePlatformRole(roles:Array<NonNullable<SessionIdentity['platformRole']>>=['owner','support']){const identity=await requireSessionIdentity();if(identity.supportMode)throw new Error("End Support View before using platform administration");if(!identity.platformRole||!roles.includes(identity.platformRole))throw new Error("Platform administrator access is required");return identity;}
export async function requireOrganizationAccess(organizationId:string){const identity=await requireSessionIdentity();if(!identity.organizationIds.includes(organizationId))throw new Error("Organization access denied");return identity;}
