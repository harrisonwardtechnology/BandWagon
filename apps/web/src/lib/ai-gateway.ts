import { getDb } from "@/lib/db";
import { getPrivateObjectBytes } from "@/lib/object-storage";
import { assertOrgAiFeatureEnabled,type OrgAiFeature } from "@/lib/org-ai";

function dbRequired(){const db=getDb();if(!db)throw new Error("Database is not configured");return db;}
function env(name:string){const value=process.env[name];if(!value)throw new Error(`${name} is not configured`);return value;}

type AiInput={
  purpose:string;organizationId?:string|null;personId?:string|null;documentId?:string|null;
  modelAlias?:string;instruction:string;image?:{bytes:Buffer;contentType:string}|null;promptVersion?:string;
};

function featureForPurpose(purpose:string):OrgAiFeature|null{
  if(["insurance_review","driver_license_review","document_review"].includes(purpose))return "document_review";
  if(purpose==="event_intake")return "event_intake";
  if(["match_explanation","match_explanations"].includes(purpose))return "match_explanations";
  if(["admin_copilot","admin_question"].includes(purpose))return "admin_copilot";
  if(["safety_summary","incident_summary"].includes(purpose))return "safety_summaries";
  return null;
}

function parseJsonText(value:string){
  const cleaned=value.trim().replace(/^```json\s*/i,"").replace(/```$/," ").trim();
  return JSON.parse(cleaned);
}

async function recordDaily(input:{organizationId?:string|null;purpose:string;modelAlias:string;inputTokens:number;outputTokens:number;costMicrousd:number}){
  if(!input.organizationId)return;
  const db=dbRequired();
  await db.query(
    `insert into ai_usage_daily (usage_date,organization_id,purpose,model_alias,job_count,input_tokens,output_tokens,estimated_cost_microusd)
     values (current_date,$1,$2,$3,1,$4,$5,$6)
     on conflict (usage_date,organization_id,purpose,model_alias) do update set
       job_count=ai_usage_daily.job_count+1,input_tokens=ai_usage_daily.input_tokens+excluded.input_tokens,
       output_tokens=ai_usage_daily.output_tokens+excluded.output_tokens,
       estimated_cost_microusd=ai_usage_daily.estimated_cost_microusd+excluded.estimated_cost_microusd`,
    [input.organizationId,input.purpose,input.modelAlias,input.inputTokens,input.outputTokens,input.costMicrousd]
  );
}

export async function runStructuredAi(input:AiInput){
  const feature=featureForPurpose(input.purpose);
  if(feature&&input.organizationId)await assertOrgAiFeatureEnabled(input.organizationId,feature);
  const db=dbRequired();
  const modelAlias=input.modelAlias||process.env.AI_FAST_MODEL||"bandwagon-fast";
  const job=await db.query(
    `insert into ai_jobs (organization_id,person_id,document_id,purpose,provider_path,model_alias,status,prompt_version,started_at)
     values ($1,$2,$3,$4,'litellm',$5,'processing',$6,now()) returning id`,
    [input.organizationId||null,input.personId||null,input.documentId||null,input.purpose,modelAlias,input.promptVersion||"v1"]
  );
  const jobId=job.rows[0].id;
  try{
    const userContent:any[]= [{type:"text",text:input.instruction}];
    if(input.image){userContent.push({type:"image_url",image_url:{url:`data:${input.image.contentType};base64,${input.image.bytes.toString("base64")}`}});}
    const response=await fetch(`${env("LITELLM_BASE_URL").replace(/\/$/,"")}/v1/chat/completions`,{
      method:"POST",headers:{authorization:`Bearer ${env("LITELLM_API_KEY")}`,"content-type":"application/json"},
      body:JSON.stringify({model:modelAlias,messages:[
        {role:"system",content:"You are a BandWagon extraction assistant. Return only valid JSON. Never decide whether a person is safe or eligible to drive; extract facts and flag uncertainty for human review."},
        {role:"user",content:userContent},
      ],response_format:{type:"json_object"}}),cache:"no-store",
    });
    const body:any=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(body?.error?.message||`LiteLLM request failed (${response.status})`);
    const text=body?.choices?.[0]?.message?.content;
    if(typeof text!=="string")throw new Error("AI response did not contain structured text");
    const result=parseJsonText(text);
    const inputTokens=Number(body?.usage?.prompt_tokens||0);const outputTokens=Number(body?.usage?.completion_tokens||0);
    const headerCost=Number(response.headers.get("x-litellm-response-cost")||body?._hidden_params?.response_cost||0);
    const costMicrousd=Number.isFinite(headerCost)?Math.round(headerCost*1_000_000):0;
    const confidence=typeof result.confidence==="number"?Math.max(0,Math.min(1,result.confidence)):null;
    const humanReview=confidence==null||confidence<0.9||Boolean(result.human_review_required)||Array.isArray(result.warnings)&&result.warnings.length>0;
    await db.query(
      `update ai_jobs set status='completed',result_json=$1::jsonb,confidence=$2,human_review_required=$3,
         input_tokens=$4,output_tokens=$5,estimated_cost_microusd=$6,provider_request_id=$7,completed_at=now(),updated_at=now()
       where id=$8`,
      [JSON.stringify(result),confidence,humanReview,inputTokens,outputTokens,costMicrousd,body?.id||null,jobId]
    );
    await recordDaily({organizationId:input.organizationId,purpose:input.purpose,modelAlias,inputTokens,outputTokens,costMicrousd});
    return {jobId,result,confidence,humanReview,costMicrousd,modelAlias};
  }catch(error){
    await db.query(`update ai_jobs set status='failed',error_message=$1,completed_at=now(),updated_at=now() where id=$2`,[error instanceof Error?error.message:"AI request failed",jobId]);
    throw error;
  }
}

export async function analyzeInsuranceDocument(input:{documentId:string;organizationId?:string|null;personId:string;storageKey:string;contentType:string}){
  if(!input.contentType.startsWith("image/"))throw new Error("Automated insurance review currently supports image uploads; PDF documents remain available for manual review");
  const object=await getPrivateObjectBytes(input.storageKey);
  return runStructuredAi({
    purpose:"insurance_review",organizationId:input.organizationId,personId:input.personId,documentId:input.documentId,image:object,
    instruction:"Extract the insurance document facts. Return JSON with insured_name, carrier, policy_effective_date, policy_expiration_date, vehicle_description, document_readable, confidence, warnings (array), and human_review_required. Do not return full policy numbers, addresses, VINs, or other unnecessary identifiers.",
    promptVersion:"insurance-v1",
  });
}
