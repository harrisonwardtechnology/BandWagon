import { getDb } from "@/lib/db";
import { encryptSensitive } from "@/lib/data-security";
import { runStructuredAi } from "@/lib/ai-gateway";
import { createManualEvent } from "@/lib/events";
import type { SessionIdentity } from "@/lib/auth";

function dbRequired(){const db=getDb();if(!db)throw new Error("Database is not configured");return db;}

async function assertOrgAdmin(identity:SessionIdentity,organizationId:string){
  const db=dbRequired();const result=await db.query(`select 1 from memberships where organization_id=$1 and person_id=$2 and group_id is null and status='active' and role in ('owner','admin','manager') limit 1`,[organizationId,identity.personId]);
  if(!result.rowCount)throw new Error("Organization administrator access is required");
}

function normalizedProposal(value:any){
  const title=String(value?.title||"").trim();if(!title)throw new Error("AI did not identify an event title");
  const date=(v:any)=>{if(!v)return null;const d=new Date(String(v));return Number.isNaN(d.getTime())?null:d.toISOString();};
  return {
    title,
    description:value?.description?String(value.description).slice(0,4000):null,
    locationName:value?.location_name?String(value.location_name).slice(0,250):null,
    locationAddress:value?.location_address?String(value.location_address).slice(0,500):null,
    startsAt:date(value?.starts_at),endsAt:date(value?.ends_at),allDay:Boolean(value?.all_day),
    rideCoordinationEnabled:value?.ride_coordination_enabled!==false,
    rideArrivalTargetAt:date(value?.ride_arrival_target_at),rideDepartureTargetAt:date(value?.ride_departure_target_at),
    confidence:typeof value?.confidence==='number'?Math.max(0,Math.min(1,value.confidence)):null,
    warnings:Array.isArray(value?.warnings)?value.warnings.map((x:any)=>String(x)).slice(0,10):[],
  };
}

export async function createEventIntakeDraft(identity:SessionIdentity,input:{organizationId:string;text:string}){
  const db=dbRequired();await assertOrgAdmin(identity,input.organizationId);
  const text=input.text.trim();if(text.length<10)throw new Error("Paste enough information to identify an event");if(text.length>20000)throw new Error("Event source text is too long");
  const draft=await db.query(`insert into event_intake_drafts(organization_id,created_by_person_id,source_type,source_text_ciphertext,status) values($1,$2,'pasted_text',$3,'draft') returning id`,[input.organizationId,identity.personId,encryptSensitive(text)]);
  try{
    const ai=await runStructuredAi({purpose:"event_intake",organizationId:input.organizationId,personId:identity.personId,instruction:`Convert the following organization announcement into one proposed calendar event. Return JSON only with: title, description, location_name, location_address, starts_at, ends_at, all_day, ride_coordination_enabled, ride_arrival_target_at, ride_departure_target_at, confidence, warnings. Use ISO 8601 date-times when the source provides enough information. Do not invent a date, time, address, or transportation target. Put uncertainty in warnings. Source:\n\n${text}`,promptVersion:"event-intake-v1"});
    const proposal=normalizedProposal(ai.result);
    const result=await db.query(`update event_intake_drafts set ai_job_id=$1,proposed_event=$2::jsonb,status='ready_for_review',updated_at=now() where id=$3 returning *`,[ai.jobId,JSON.stringify(proposal),draft.rows[0].id]);
    return {...result.rows[0],proposal};
  }catch(error){await db.query(`update event_intake_drafts set status='failed',updated_at=now() where id=$1`,[draft.rows[0].id]);throw error;}
}

export async function publishEventIntakeDraft(identity:SessionIdentity,input:{draftId:string;proposal?:Record<string,any>|null}){
  const db=dbRequired();const draft=(await db.query(`select * from event_intake_drafts where id=$1`,[input.draftId])).rows[0];if(!draft)throw new Error("Event draft not found");await assertOrgAdmin(identity,draft.organization_id);if(draft.status!=='ready_for_review')throw new Error("Event draft is not ready to publish");
  const proposal=normalizedProposal(input.proposal||draft.proposed_event);
  const event=await createManualEvent({organizationId:draft.organization_id,title:proposal.title,description:proposal.description,locationName:proposal.locationName,locationAddress:proposal.locationAddress,startsAt:proposal.startsAt,endsAt:proposal.endsAt,allDay:proposal.allDay,rideCoordinationEnabled:proposal.rideCoordinationEnabled,createdByPersonId:identity.personId});
  await db.query(`update event_intake_drafts set proposed_event=$1::jsonb,status='published',published_event_id=$2,reviewed_by_person_id=$3,reviewed_at=now(),updated_at=now() where id=$4`,[JSON.stringify(proposal),event.id,identity.personId,draft.id]);
  return event;
}

export async function rejectEventIntakeDraft(identity:SessionIdentity,draftId:string){
  const db=dbRequired();const draft=(await db.query(`select organization_id,status from event_intake_drafts where id=$1`,[draftId])).rows[0];if(!draft)throw new Error("Event draft not found");await assertOrgAdmin(identity,draft.organization_id);await db.query(`update event_intake_drafts set status='rejected',reviewed_by_person_id=$1,reviewed_at=now(),updated_at=now() where id=$2 and status in ('draft','ready_for_review')`,[identity.personId,draftId]);return {ok:true};
}

export async function listEventIntakeDrafts(identity:SessionIdentity,organizationId:string){
  const db=dbRequired();await assertOrgAdmin(identity,organizationId);const result=await db.query(`select id,source_type,proposed_event,status,published_event_id,reviewed_at,created_at,updated_at from event_intake_drafts where organization_id=$1 order by created_at desc limit 50`,[organizationId]);return result.rows;
}
