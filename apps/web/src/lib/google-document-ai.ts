import crypto from "node:crypto";
import { getDb } from "@/lib/db";
import { getPrivateObjectBytes } from "@/lib/object-storage";

function dbRequired(){const db=getDb();if(!db)throw new Error("Database is not configured");return db;}
function env(name:string){const value=process.env[name];if(!value)throw new Error(`${name} is not configured`);return value;}
function b64url(value:string|Buffer){return Buffer.from(value).toString("base64url");}

function serviceAccount(){
  try{return JSON.parse(env("GOOGLE_DOCUMENT_AI_SERVICE_ACCOUNT_JSON"));}
  catch{throw new Error("GOOGLE_DOCUMENT_AI_SERVICE_ACCOUNT_JSON is not valid JSON");}
}

async function accessToken(){
  const account=serviceAccount();const now=Math.floor(Date.now()/1000);
  const header=b64url(JSON.stringify({alg:"RS256",typ:"JWT"}));
  const payload=b64url(JSON.stringify({iss:account.client_email,scope:"https://www.googleapis.com/auth/cloud-platform",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600}));
  const unsigned=`${header}.${payload}`;
  const signature=crypto.sign("RSA-SHA256",Buffer.from(unsigned),account.private_key).toString("base64url");
  const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:`${unsigned}.${signature}`}),cache:"no-store"});
  const body:any=await response.json().catch(()=>({}));if(!response.ok||!body.access_token)throw new Error(body.error_description||"Unable to authenticate to Google Document AI");return String(body.access_token);
}

function safeEntity(entity:any){
  const type=String(entity?.type||"").toLowerCase();
  if(!type||type.includes("number")||type.includes("address")||type.includes("identifier")||type==="id")return null;
  const allow=["name","first","last","state","region","expiration","expiry","birth","dob","class","sex","gender"];
  if(!allow.some(term=>type.includes(term)))return null;
  return {type,mentionText:entity?.mentionText||null,confidence:typeof entity?.confidence==="number"?entity.confidence:null,normalizedValue:entity?.normalizedValue?.text||entity?.normalizedValue?.dateValue||null};
}

export async function analyzeDriverLicenseDocument(input:{documentId:string;organizationId?:string|null;personId:string;storageKey:string;contentType:string}){
  const db=dbRequired();const processorName=env("GOOGLE_DOCUMENT_AI_PROCESSOR_NAME");
  const job=await db.query(
    `insert into ai_jobs (organization_id,person_id,document_id,purpose,provider_path,model_alias,status,prompt_version,started_at)
     values ($1,$2,$3,'driver_license_review','google_document_ai','specialized','processing','driver-license-v1',now()) returning id`,
    [input.organizationId||null,input.personId,input.documentId]
  );
  const jobId=job.rows[0].id;
  try{
    const object=await getPrivateObjectBytes(input.storageKey);const token=await accessToken();
    const endpoint=(process.env.GOOGLE_DOCUMENT_AI_ENDPOINT||"https://documentai.googleapis.com").replace(/\/$/,"");
    const response=await fetch(`${endpoint}/v1/${processorName}:process`,{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify({rawDocument:{content:object.bytes.toString("base64"),mimeType:input.contentType}}),cache:"no-store"});
    const body:any=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body?.error?.message||`Google Document AI failed (${response.status})`);
    const entities=(Array.isArray(body?.document?.entities)?body.document.entities:[]).map(safeEntity).filter(Boolean);
    const confidence=entities.length?Math.min(...entities.map((e:any)=>Number(e.confidence||0))):null;
    const result={document_readable:Boolean(body?.document?.text),fields:entities,confidence,warnings:entities.length?[]:["No safe structured fields were extracted"],human_review_required:true};
    const costUsd=Number(process.env.GOOGLE_DOCUMENT_AI_COST_USD_PER_DOCUMENT||"0.10");const costMicrousd=Math.max(0,Math.round(costUsd*1_000_000));
    await db.query(`update ai_jobs set status='completed',result_json=$1::jsonb,confidence=$2,human_review_required=true,estimated_cost_microusd=$3,completed_at=now(),updated_at=now() where id=$4`,[JSON.stringify(result),confidence,costMicrousd,jobId]);
    if(input.organizationId)await db.query(
      `insert into ai_usage_daily (usage_date,organization_id,purpose,model_alias,job_count,estimated_cost_microusd)
       values (current_date,$1,'driver_license_review','specialized',1,$2)
       on conflict (usage_date,organization_id,purpose,model_alias) do update set job_count=ai_usage_daily.job_count+1,estimated_cost_microusd=ai_usage_daily.estimated_cost_microusd+excluded.estimated_cost_microusd`,
      [input.organizationId,costMicrousd]
    );
    return {jobId,result,confidence,humanReview:true,costMicrousd,modelAlias:"specialized"};
  }catch(error){await db.query(`update ai_jobs set status='failed',error_message=$1,completed_at=now(),updated_at=now() where id=$2`,[error instanceof Error?error.message:"Document AI failed",jobId]);throw error;}
}
