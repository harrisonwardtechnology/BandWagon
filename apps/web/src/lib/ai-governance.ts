import { getDb } from "@/lib/db";
import { ORG_AI_CONSENT_VERSION,type OrgAiFeature } from "@/lib/org-ai";
import { aiReservationMicrousd,aiRuntimeEnabled,allowedAiModels,budgetAllows,centsToMicrousd } from "@/lib/ai-governance-policy";

const featureField:Record<OrgAiFeature,string>={document_review:"document_review_enabled",event_intake:"event_intake_enabled",match_explanations:"match_explanations_enabled",admin_copilot:"admin_copilot_enabled",safety_summaries:"safety_summaries_enabled"};
function dbRequired(){const db=getDb();if(!db)throw new Error("Database is not configured");return db;}

async function recordDenied(input:{organizationId?:string|null;personId?:string|null;purpose:string;reason:string;reservation:number}){
  if(!input.organizationId)return;
  await dbRequired().query(`insert into ai_policy_events(organization_id,person_id,purpose,decision,reason,requested_reservation_microusd) values($1,$2,$3,'denied',$4,$5)`,[input.organizationId,input.personId||null,input.purpose,input.reason,input.reservation]).catch(()=>{});
}

export async function beginGovernedAiJob(input:{organizationId?:string|null;personId?:string|null;documentId?:string|null;purpose:string;feature:OrgAiFeature;providerPath:'litellm'|'google_document_ai';modelAlias:string;promptVersion:string;reservationMicrousd?:number}){
  const reservation=aiReservationMicrousd(input.reservationMicrousd??process.env.AI_MAX_JOB_COST_MICROUSD);
  const deny=async(reason:string)=>{await recordDenied({...input,reason,reservation});throw new Error(reason);};
  if(!aiRuntimeEnabled(process.env.AI_RUNTIME_ENABLED))return deny("AI processing is disabled; continue with the manual workflow");
  if(!input.organizationId)return deny("AI processing requires an organization opt-in; continue with the manual workflow");
  if(input.providerPath==='litellm'&&!allowedAiModels(process.env).has(input.modelAlias))return deny("The requested AI model is not approved");
  const db=dbRequired(),client=await db.connect();
  try{
    await client.query("begin");
    const settings=(await client.query(`select * from organization_ai_settings where organization_id=$1 for update`,[input.organizationId])).rows[0];
    if(!settings||!settings.ai_enabled||!settings[featureField[input.feature]])throw new Error("This AI feature is not enabled; continue with the manual workflow");
    if(settings.consent_version!==ORG_AI_CONSENT_VERSION)throw new Error("AI consent must be renewed before processing");
    const budget=centsToMicrousd(settings.monthly_budget_cents);
    const usage=Number((await client.query(`select coalesce(sum(case when status='processing' then reserved_cost_microusd else estimated_cost_microusd end),0)::bigint as total from ai_jobs where organization_id=$1 and created_at>=date_trunc('month',now()) and status in ('processing','completed')`,[input.organizationId])).rows[0]?.total||0);
    if(!budgetAllows({budgetMicrousd:budget,committedAndReservedMicrousd:usage,requestedReservationMicrousd:reservation}))throw new Error("The organization AI monthly budget has been reached; continue with the manual workflow");
    const job=(await client.query(`insert into ai_jobs(organization_id,person_id,document_id,purpose,provider_path,model_alias,status,prompt_version,started_at,reserved_cost_microusd,policy_decision) values($1,$2,$3,$4,$5,$6,'processing',$7,now(),$8,'allowed') returning id`,[input.organizationId,input.personId||null,input.documentId||null,input.purpose,input.providerPath,input.modelAlias,input.promptVersion,reservation])).rows[0];
    await client.query(`insert into ai_policy_events(organization_id,person_id,ai_job_id,purpose,decision,monthly_budget_microusd,committed_and_reserved_microusd,requested_reservation_microusd) values($1,$2,$3,$4,'allowed',$5,$6,$7)`,[input.organizationId,input.personId||null,job.id,input.purpose,budget,usage,reservation]);
    await client.query("commit");return{jobId:job.id,reservationMicrousd:reservation};
  }catch(error){await client.query("rollback").catch(()=>{});const reason=error instanceof Error?error.message:"AI policy denied processing";await client.query(`insert into ai_policy_events(organization_id,person_id,purpose,decision,reason,requested_reservation_microusd) values($1,$2,$3,'denied',$4,$5)`,[input.organizationId,input.personId||null,input.purpose,reason,reservation]).catch(()=>{});throw error;}finally{client.release();}
}

export async function recordAiFallback(input:{jobId:string;organizationId?:string|null;personId?:string|null;purpose:string;reason:string;timedOut?:boolean}){
  const db=dbRequired();const safeReason=input.reason.slice(0,500);
  await Promise.all([
    db.query(`update ai_jobs set status='failed',reserved_cost_microusd=0,error_code=$1,error_message=$2,fallback_reason='manual_workflow',timed_out=$3,completed_at=now(),updated_at=now() where id=$4`,[input.timedOut?'timeout':'provider_failure',safeReason,Boolean(input.timedOut),input.jobId]),
    db.query(`insert into ai_policy_events(organization_id,person_id,ai_job_id,purpose,decision,reason) values($1,$2,$3,$4,'fallback',$5)`,[input.organizationId||null,input.personId||null,input.jobId,input.purpose,safeReason]),
  ]);
}
