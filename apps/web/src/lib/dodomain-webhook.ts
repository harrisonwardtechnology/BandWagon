import crypto from "node:crypto";
import { getDb } from "@/lib/db";
import { verifyCustomDomain } from "@/lib/saas-tenants";

export function verifyDoDomainWebhook(secret:string,body:string,header:string,toleranceMs=5*60*1000){
  if(!secret||!header)return false;
  const parts=Object.fromEntries(header.split(",").map(kv=>kv.split("=").map(s=>s.trim())));
  const timestamp=Number(parts.t);const signature=String(parts.v1||"");
  if(!timestamp||Math.abs(Date.now()-timestamp)>toleranceMs)return false;
  if(!/^[0-9a-f]{64}$/.test(signature))return false;
  const expected=crypto.createHmac("sha256",secret).update(`${timestamp}.${body}`).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature,"hex"),Buffer.from(expected,"hex"));
}

function stringValue(value:unknown){return typeof value==="string"&&value.trim()?value.trim():null;}

export async function processDoDomainWebhook(rawBody:string,signature:string){
  const secret=process.env.DODOMAIN_WEBHOOK_SECRET;
  if(!secret)throw new Error("DODOMAIN_WEBHOOK_SECRET is not configured");
  if(!verifyDoDomainWebhook(secret,rawBody,signature))throw new Error("Invalid DoDomain webhook signature");
  const payload=JSON.parse(rawBody||"{}");
  const eventId=stringValue(payload.id);const eventType=stringValue(payload.type||payload.event);const data=payload.data&&typeof payload.data==="object"?payload.data:{};
  if(!eventId||!eventType)throw new Error("Invalid DoDomain webhook envelope");
  const hostname=stringValue(data.domain||data.hostname||data.fqdn)?.toLowerCase()||null;
  const sessionId=stringValue(data.sessionId||data.session_id);
  const connectionId=stringValue(data.connectionId||data.connection_id||data.id);
  const db=getDb();if(!db)throw new Error("Database is not configured");

  const existing=await db.query(`select processing_status from domain_provider_webhook_events where event_id=$1 limit 1`,[eventId]);
  if(existing.rowCount)return{duplicate:true,eventId,eventType};

  let domain:any=null;
  if(hostname){domain=(await db.query(`select * from organization_domains where lower(hostname)=$1 and domain_type='custom' limit 1`,[hostname])).rows[0]||null;}
  if(!domain&&sessionId){domain=(await db.query(`select * from organization_domains where setup_provider='dodomain' and setup_provider_session_id=$1 limit 1`,[sessionId])).rows[0]||null;}

  await db.query(`insert into domain_provider_webhook_events(event_id,provider,event_type,hostname,organization_domain_id,payload) values($1,'dodomain',$2,$3,$4,$5::jsonb)`,[eventId,eventType,hostname,domain?.id||null,rawBody]);
  if(!domain){
    await db.query(`update domain_provider_webhook_events set processing_status='ignored',processed_at=now() where event_id=$1`,[eventId]);
    return{ignored:true,eventId,eventType,reason:"No BandWagon custom domain matched"};
  }

  try{
    const now=new Date();
    if(eventType==="connection.verified"){
      await db.query(`update organization_domains set setup_status='verified',setup_provider_connection_id=coalesce($2,setup_provider_connection_id),provider_monitor_status='healthy',provider_last_event_id=$3,provider_last_event_type=$4,provider_last_event_at=$5,provider_last_verified_at=$5,provider_failure_detail='{}'::jsonb,dns_status='active',last_checked_at=$5,updated_at=$5 where id=$1`,[domain.id,connectionId,eventId,eventType,now]);
      // DoDomain confirms authoritative DNS. Cloudflare remains the source of truth for edge TLS readiness.
      await verifyCustomDomain(domain.id).catch(async error=>{await db.query(`update organization_domains set provider_monitor_status='degraded',provider_failure_detail=$2::jsonb,updated_at=now() where id=$1`,[domain.id,JSON.stringify({stage:"cloudflare_tls_check",error:error instanceof Error?error.message:"TLS verification failed"})]);});
    }else if(eventType==="connection.failed"){
      await db.query(`update organization_domains set setup_provider_connection_id=coalesce($2,setup_provider_connection_id),provider_monitor_status='failed',provider_last_event_id=$3,provider_last_event_type=$4,provider_last_event_at=$5,provider_last_failed_at=$5,provider_failure_detail=$6::jsonb,dns_status='failed',last_checked_at=$5,updated_at=$5 where id=$1`,[domain.id,connectionId,eventId,eventType,now,JSON.stringify(data)]);
    }else if(eventType==="connection.disconnected"){
      await db.query(`update organization_domains set provider_monitor_status='disconnected',provider_last_event_id=$2,provider_last_event_type=$3,provider_last_event_at=$4,provider_failure_detail=$5::jsonb,dns_status='disconnected',setup_status='not_started',updated_at=$4 where id=$1`,[domain.id,eventId,eventType,now,JSON.stringify(data)]);
    }else{
      await db.query(`update organization_domains set provider_last_event_id=$2,provider_last_event_type=$3,provider_last_event_at=$4,updated_at=$4 where id=$1`,[domain.id,eventId,eventType,now]);
    }
    await db.query(`update domain_provider_webhook_events set processing_status='processed',processed_at=now() where event_id=$1`,[eventId]);
    await db.query(`insert into audit_events(organization_id,action,target_type,target_id,metadata) values($1,$2,'organization_domain',$3,$4::jsonb)`,[domain.organization_id,`domain.dodomain.${eventType}`,domain.id,JSON.stringify({eventId,hostname:domain.hostname,connectionId})]).catch(()=>{});
    return{processed:true,eventId,eventType,domainId:domain.id,hostname:domain.hostname};
  }catch(error){
    await db.query(`update domain_provider_webhook_events set processing_status='failed',processing_error=$2,processed_at=now() where event_id=$1`,[eventId,error instanceof Error?error.message:"Webhook processing failed"]).catch(()=>{});
    throw error;
  }
}
