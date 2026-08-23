import { getDb } from "@/lib/db";
import type { SessionIdentity } from "@/lib/auth";
import { analyzeInsuranceDocument } from "@/lib/ai-gateway";
import { analyzeDriverLicenseDocument } from "@/lib/google-document-ai";

function dbRequired(){const db=getDb();if(!db)throw new Error("Database is not configured");return db;}

function asDate(value:unknown){
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}/.test(value))return null;
  return value.slice(0,10);
}

function licenseExpiry(result:any){
  const fields=Array.isArray(result?.fields)?result.fields:[];
  for(const field of fields){
    if(String(field?.type||"").includes("expir")){
      const normalized=field?.normalizedValue;
      if(typeof normalized==="string")return asDate(normalized);
      if(normalized&&typeof normalized==="object"&&normalized.year&&normalized.month&&normalized.day)return `${String(normalized.year).padStart(4,"0")}-${String(normalized.month).padStart(2,"0")}-${String(normalized.day).padStart(2,"0")}`;
      return asDate(field?.mentionText);
    }
  }
  return null;
}

export async function processMyCredential(identity:SessionIdentity,input:{documentId:string;organizationId?:string|null}){
  const db=dbRequired();
  const documentResult=await db.query(`select * from person_documents where id=$1 and person_id=$2 and status in ('uploaded','ready','rejected')`,[input.documentId,identity.personId]);
  if(!documentResult.rowCount)throw new Error("Uploaded credential not found");
  const document=documentResult.rows[0];
  if(input.organizationId){
    const membership=await db.query(`select 1 from memberships where organization_id=$1 and person_id=$2 and group_id is null and status='active' limit 1`,[input.organizationId,identity.personId]);
    if(!membership.rowCount)throw new Error("You are not a member of that organization");
  }
  await db.query(`update person_documents set status='processing',updated_at=now() where id=$1`,[document.id]);
  await db.query(`insert into document_access_events (document_id,actor_person_id,organization_id,access_type,purpose) values ($1,$2,$3,'ai_process','credential_fact_extraction')`,[document.id,identity.personId,input.organizationId||null]);
  try{
    let analysis:any;let expiresAt:string|null=null;
    if(document.document_type==="driver_license"){
      analysis=await analyzeDriverLicenseDocument({documentId:document.id,organizationId:input.organizationId,personId:identity.personId,storageKey:document.storage_key,contentType:document.content_type});
      expiresAt=licenseExpiry(analysis.result);
    }else if(document.document_type==="insurance"){
      analysis=await analyzeInsuranceDocument({documentId:document.id,organizationId:input.organizationId,personId:identity.personId,storageKey:document.storage_key,contentType:document.content_type});
      expiresAt=asDate(analysis.result?.policy_expiration_date);
    }else{
      analysis={jobId:null,result:{human_review_required:true,warnings:["Manual organization review required"]},confidence:null,humanReview:true,costMicrousd:0};
    }
    await db.query(
      `update person_documents set status='ready',expires_at=coalesce($1::date,expires_at),extracted_metadata=$2::jsonb,updated_at=now() where id=$3`,
      [expiresAt,JSON.stringify({automatedReview:{jobId:analysis.jobId,confidence:analysis.confidence,humanReviewRequired:true,result:analysis.result}}),document.id]
    );
    const requirementType=document.document_type==="driver_license"?"driver_license":document.document_type==="insurance"?"insurance":document.document_type==="volunteer_approval"?"district_volunteer":null;
    if(input.organizationId&&requirementType){
      await db.query(
        `insert into driver_requirement_status (organization_id,driver_person_id,requirement_type,status,document_id,expires_at,metadata,updated_at)
         values ($1,$2,$3,'pending',$4,$5,$6::jsonb,now())
         on conflict (organization_id,driver_person_id,requirement_type) do update set
           status='pending',document_id=excluded.document_id,expires_at=excluded.expires_at,metadata=excluded.metadata,reviewed_by_person_id=null,reviewed_at=null,updated_at=now()`,
        [input.organizationId,identity.personId,requirementType,document.id,expiresAt,JSON.stringify({aiJobId:analysis.jobId,aiConfidence:analysis.confidence})]
      );
    }
    return {documentId:document.id,status:"ready",expiresAt,analysis};
  }catch(error){
    await db.query(`update person_documents set status='uploaded',updated_at=now() where id=$1`,[document.id]);
    throw error;
  }
}
