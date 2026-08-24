import { getDb } from "@/lib/db";
import type { SessionIdentity } from "@/lib/auth";
import { assertIdentityOrganizationAdmin } from "@/lib/admin-access";

export type OrgAiFeature = "document_review"|"event_intake"|"match_explanations"|"admin_copilot"|"safety_summaries";

export const ORG_AI_CONSENT_VERSION="2026-08-v1";

export const ORG_AI_FEATURES:Record<OrgAiFeature,{title:string;gets:string;without:string;data:string}>={
  document_review:{title:"Driver Document Review",gets:"AI extracts facts from license / insurance documents to reduce admin review time. Human organization approval is still required.",without:"Documents still upload securely, but organization admins review and enter facts manually.",data:"Selected credential images / document contents may be sent to configured AI document-processing providers."},
  event_intake:{title:"AI Event Intake",gets:"Paste an email, announcement, or schedule and receive a proposed structured event for admin review.",without:"Events are created manually or imported from connected calendars.",data:"The text or image submitted for event intake may be sent to the configured LLM provider."},
  match_explanations:{title:"Friendly Match Explanations",gets:"Turns deterministic match reasons into easier-to-read explanations. AI never chooses the match.",without:"BandWagon still matches normally and shows deterministic score / rule details without AI wording.",data:"Only the minimum generalized match factors needed to explain the result are sent; exact private locations are excluded."},
  admin_copilot:{title:"Admin Copilot",gets:"Admins can ask operational questions such as open rides, expiring credentials, or coverage gaps through approved BandWagon tools.",without:"All dashboards and reports remain available; admins navigate them manually.",data:"The question and sanitized tool results may be sent to the configured LLM provider."},
  safety_summaries:{title:"Safety Summary Assistance",gets:"AI can summarize existing safety / incident records for an authorized admin. It never decides emergency actions or safety outcomes.",without:"Safety records remain fully available and are reviewed manually.",data:"Sanitized incident text may be sent to the configured LLM provider. Exact emergency location and unnecessary minor PII are excluded."},
};

function dbRequired(){const db=getDb();if(!db)throw new Error("Database is not configured");return db;}

export async function getOrganizationAiSettings(organizationId:string){
  const db=dbRequired();
  await db.query(`insert into organization_ai_settings (organization_id) values ($1) on conflict do nothing`,[organizationId]);
  const r=await db.query(`select * from organization_ai_settings where organization_id=$1`,[organizationId]);
  if(!r.rowCount)throw new Error("Organization AI settings not found");
  return r.rows[0];
}

export async function getOrganizationAiSettingsForAdmin(identity:SessionIdentity,organizationId:string){
  await assertIdentityOrganizationAdmin(identity,organizationId,{write:false});
  return getOrganizationAiSettings(organizationId);
}

export async function updateOrganizationAiSettings(identity:SessionIdentity,input:{organizationId:string;aiEnabled:boolean;documentReviewEnabled?:boolean;eventIntakeEnabled?:boolean;matchExplanationsEnabled?:boolean;adminCopilotEnabled?:boolean;safetySummariesEnabled?:boolean;monthlyBudgetCents?:number|null}){
  await assertIdentityOrganizationAdmin(identity,input.organizationId);const db=dbRequired();
  const before=await getOrganizationAiSettings(input.organizationId);
  const master=Boolean(input.aiEnabled);
  const result=await db.query(`update organization_ai_settings set
      ai_enabled=$1,
      document_review_enabled=$2,
      event_intake_enabled=$3,
      match_explanations_enabled=$4,
      admin_copilot_enabled=$5,
      safety_summaries_enabled=$6,
      monthly_budget_cents=$7,
      consent_version=$8,
      consented_by_person_id=$9,
      consented_at=case when $1 then now() else consented_at end,
      updated_at=now()
    where organization_id=$10 returning *`,[
      master,
      master&&Boolean(input.documentReviewEnabled),
      master&&Boolean(input.eventIntakeEnabled),
      master&&Boolean(input.matchExplanationsEnabled),
      master&&Boolean(input.adminCopilotEnabled),
      master&&Boolean(input.safetySummariesEnabled),
      input.monthlyBudgetCents==null?null:Math.max(0,Math.round(Number(input.monthlyBudgetCents))),
      ORG_AI_CONSENT_VERSION,identity.personId,input.organizationId
    ]);
  await db.query(`insert into organization_ai_setting_events (organization_id,actor_person_id,previous_settings,new_settings,consent_version) values ($1,$2,$3::jsonb,$4::jsonb,$5)`,[input.organizationId,identity.personId,JSON.stringify(before),JSON.stringify(result.rows[0]),ORG_AI_CONSENT_VERSION]);
  return result.rows[0];
}

export async function isOrgAiFeatureEnabled(organizationId:string|undefined|null,feature:OrgAiFeature){
  if(!organizationId)return false;
  const s=await getOrganizationAiSettings(organizationId);
  const field:Record<OrgAiFeature,string>={document_review:"document_review_enabled",event_intake:"event_intake_enabled",match_explanations:"match_explanations_enabled",admin_copilot:"admin_copilot_enabled",safety_summaries:"safety_summaries_enabled"};
  return Boolean(s.ai_enabled&&s[field[feature]]);
}

export async function assertOrgAiFeatureEnabled(organizationId:string|undefined|null,feature:OrgAiFeature){
  if(!organizationId||!(await isOrgAiFeatureEnabled(organizationId,feature)))throw new Error(`${ORG_AI_FEATURES[feature].title} is not enabled for this organization`);
}
