import { getDb } from "@/lib/db";

function dbRequired(){const db=getDb();if(!db)throw new Error("Database is not configured");return db;}
function bool(value:unknown){return Boolean(value);}
function envAny(...names:string[]){return names.some(name=>bool(process.env[name]));}
function status(configured:boolean,failures:number,lastSuccess?:Date|null){if(!configured)return 'failed';if(failures>0)return 'degraded';if(lastSuccess&&Date.now()-lastSuccess.getTime()>36*60*60*1000)return 'degraded';return 'healthy';}

export async function recordHeartbeat(input:{key:string;type:'cron'|'integration'|'service'|'storage'|'database';ok:boolean;durationMs?:number|null;error?:string|null;metadata?:Record<string,unknown>}){
 const db=dbRequired();
 await db.query(`insert into platform_health_heartbeats(component_key,component_type,status,last_started_at,last_succeeded_at,last_failed_at,last_duration_ms,consecutive_failures,last_error,metadata,updated_at) values($1,$2,$3,now(),case when $4 then now() end,case when not $4 then now() end,$5,case when $4 then 0 else 1 end,$6,$7::jsonb,now()) on conflict(component_key) do update set component_type=excluded.component_type,status=excluded.status,last_started_at=now(),last_succeeded_at=case when $4 then now() else platform_health_heartbeats.last_succeeded_at end,last_failed_at=case when not $4 then now() else platform_health_heartbeats.last_failed_at end,last_duration_ms=$5,consecutive_failures=case when $4 then 0 else platform_health_heartbeats.consecutive_failures+1 end,last_error=case when $4 then null else $6 end,metadata=platform_health_heartbeats.metadata||$7::jsonb,updated_at=now()`,[input.key,input.type,input.ok?'healthy':'failed',input.ok,input.durationMs??null,input.error?.slice(0,1000)||null,JSON.stringify(input.metadata||{})]);
}

export async function getPlatformHealth(){
 const db=dbRequired();const started=Date.now();let dbOk=true,dbError:string|null=null;
 try{await db.query('select 1');}catch(error){dbOk=false;dbError=error instanceof Error?error.message:'Database check failed';}
 const dbLatencyMs=Date.now()-started;
 const aiRuntime=String(process.env.AI_RUNTIME_ENABLED||'').toLowerCase()==='true';
 const litellmConfigured=envAny('LITELLM_BASE_URL')&&envAny('LITELLM_API_KEY');
 const [heartbeats,aiFailures,notificationFailures,routingFailures,orgHealth,applicationErrorSummary,applicationErrors]=await Promise.all([
  db.query(`select * from platform_health_heartbeats order by component_type,component_key`).catch(()=>({rows:[]} as any)),
  db.query(`select count(*)::int as count,max(created_at) as last_failed from ai_jobs where status='failed' and created_at>=now()-interval '24 hours'`),
  db.query(`select count(*)::int as count,max(created_at) as last_failed from notification_deliveries where status in ('failed','undelivered') and created_at>=now()-interval '24 hours'`),
  db.query(`select coalesce(sum(fallback_count),0)::int as fallback_count,coalesce(sum(request_count),0)::int as request_count from routing_usage_daily where usage_date>=current_date-1`),
  db.query(`select o.id,coalesce(o.display_name,o.name) as name,
    (select count(*) from memberships m where m.organization_id=o.id and m.status='active' and m.group_id is null and m.role in ('owner','admin','manager'))::int as admins,
    (select count(*) from driver_organization_settings d where d.organization_id=o.id and d.status='active')::int as drivers,
    (select count(*) from ride_requests rr where rr.organization_id=o.id and rr.status='open' and rr.created_at<now()-interval '2 hours')::int as aging_requests,
    (select count(*) from notification_deliveries nd where nd.organization_id=o.id and nd.created_at>=now()-interval '24 hours' and nd.status in ('failed','undelivered'))::int as notification_failures,
    (select count(*) from driver_requirement_status drs where drs.organization_id=o.id and drs.expires_at between current_date and current_date+30)::int as expiring_credentials
   from organizations o where o.status='active' order by name`),
  db.query(`select count(*)::int as count,coalesce(sum(occurrence_count),0)::int as occurrences,max(last_seen_at) as last_seen from application_errors where status='open' and last_seen_at>=now()-interval '24 hours'`),
  db.query(`select id,error_name,message,route_path,request_method,occurrence_count,first_seen_at,last_seen_at,status from application_errors where status='open' order by last_seen_at desc limit 25`)
 ]);
 const hb=new Map(heartbeats.rows.map((r:any)=>[r.component_key,r]));
 const integrations=[
  {key:'database',label:'PostgreSQL',type:'database',configured:true,status:dbOk?(dbLatencyMs>750?'degraded':'healthy'):'failed',detail:dbOk?`${dbLatencyMs} ms query latency`:dbError,lastSuccess:new Date().toISOString(),troubleshoot:'/admin/platform-health'},
  {key:'s3',label:'IONOS S3',type:'storage',configured:envAny('S3_ENDPOINT')&&envAny('S3_ACCESS_KEY_ID')&&envAny('S3_SECRET_ACCESS_KEY')&&envAny('S3_PRIVATE_BUCKET'),status:envAny('S3_ENDPOINT')&&envAny('S3_ACCESS_KEY_ID')&&envAny('S3_SECRET_ACCESS_KEY')&&envAny('S3_PRIVATE_BUCKET')?'healthy':'failed',detail:envAny('S3_ENDPOINT')?'Configuration present':'Missing S3 configuration',troubleshoot:'/admin/driver-requirements'},
  {key:'twilio',label:'Twilio Messaging',type:'integration',configured:envAny('TWILIO_ACCOUNT_SID')&&envAny('TWILIO_AUTH_TOKEN'),status:status(envAny('TWILIO_ACCOUNT_SID')&&envAny('TWILIO_AUTH_TOKEN'),Number(notificationFailures.rows[0]?.count||0)),detail:`${Number(notificationFailures.rows[0]?.count||0)} delivery failures / 24h`,troubleshoot:'/admin/notifications'},
  {key:'google_routes',label:'Google Maps / Routes',type:'integration',configured:envAny('GOOGLE_MAPS_ROUTES_API_KEY','GOOGLE_MAPS_API_KEY'),status:status(envAny('GOOGLE_MAPS_ROUTES_API_KEY','GOOGLE_MAPS_API_KEY'),Number(routingFailures.rows[0]?.fallback_count||0)),detail:`${Number(routingFailures.rows[0]?.request_count||0)} calls, ${Number(routingFailures.rows[0]?.fallback_count||0)} fallbacks / 48h`,troubleshoot:'/admin/operations'},
  {key:'litellm',label:'AI Runtime / LiteLLM Gateway',type:'integration',configured:!aiRuntime||litellmConfigured,status:aiRuntime?status(litellmConfigured,Number(aiFailures.rows[0]?.count||0)):'healthy',detail:aiRuntime?`${Number(aiFailures.rows[0]?.count||0)} failed AI jobs / 24h`:'AI runtime is intentionally disabled',troubleshoot:'/admin/ai-settings'},
  {key:'email',label:'Email Delivery',type:'integration',configured:envAny('SMTP_HOST','SMTP2GO_API_KEY','RESEND_API_KEY'),status:envAny('SMTP_HOST','SMTP2GO_API_KEY','RESEND_API_KEY')?'healthy':'failed',detail:envAny('SMTP_HOST','SMTP2GO_API_KEY','RESEND_API_KEY')?'Configuration present':'Email provider is not configured',troubleshoot:'/admin/notifications'},
  {key:'push',label:'Web Push',type:'service',configured:envAny('VAPID_PUBLIC_KEY')&&envAny('VAPID_PRIVATE_KEY'),status:envAny('VAPID_PUBLIC_KEY')&&envAny('VAPID_PRIVATE_KEY')?'healthy':'failed',detail:envAny('VAPID_PUBLIC_KEY')?'VAPID keys present':'VAPID keys missing',troubleshoot:'/admin/push'}
  ,{key:'application_errors',label:'Application Errors',type:'service',configured:envAny('ERROR_MONITOR_INGEST_SECRET'),status:status(envAny('ERROR_MONITOR_INGEST_SECRET'),Number(applicationErrorSummary.rows[0]?.count||0)),detail:envAny('ERROR_MONITOR_INGEST_SECRET')?`${Number(applicationErrorSummary.rows[0]?.count||0)} open fingerprints, ${Number(applicationErrorSummary.rows[0]?.occurrences||0)} occurrences / 24h`:'ERROR_MONITOR_INGEST_SECRET is missing',troubleshoot:'/admin/health'}
 ];
 const cronDefinitions=[
  {key:'ride-reminders',label:'Ride Reminders',defaultMaxAgeMinutes:45,troubleshoot:'/admin/notifications'},
  {key:'platform-budget',label:'Platform Budget',defaultMaxAgeMinutes:2160,troubleshoot:'/admin/budget'},
  {key:'safety-maintenance',label:'Safety Maintenance',defaultMaxAgeMinutes:2160,troubleshoot:'/admin/driver-requirements'},
  {key:'privacy-maintenance',label:'Privacy Maintenance',defaultMaxAgeMinutes:180,troubleshoot:'/app/settings/privacy'},
  {key:'google-calendar-sync',label:'Google Calendar Sync',defaultMaxAgeMinutes:180,troubleshoot:'/admin/integrations'}
  ,{key:'microsoft-calendar-sync',label:'Microsoft Calendar Sync',defaultMaxAgeMinutes:180,troubleshoot:'/admin/integrations/microsoft'}
 ];
 const crons=cronDefinitions.map(def=>{const row:any=hb.get(def.key);const lastSuccess=row?.last_succeeded_at?new Date(row.last_succeeded_at):null;const expectedMaxAgeMinutes=Math.max(1,Number(row?.metadata?.expectedMaxAgeMinutes||def.defaultMaxAgeMinutes));const ageMinutes=lastSuccess?Math.floor((Date.now()-lastSuccess.getTime())/60000):null;const stale=!lastSuccess||(ageMinutes!==null&&ageMinutes>expectedMaxAgeMinutes);const failed=Number(row?.consecutive_failures||0)>0||row?.status==='failed';const jobStatus=failed?'failed':stale?'degraded':'healthy';return{key:def.key,label:def.label,status:row?jobStatus:'unknown',lastStarted:row?.last_started_at?new Date(row.last_started_at).toISOString():null,lastSuccess:lastSuccess?.toISOString()||null,lastFailure:row?.last_failed_at?new Date(row.last_failed_at).toISOString():null,consecutiveFailures:Number(row?.consecutive_failures||0),lastDurationMs:row?.last_duration_ms??null,lastError:row?.last_error||null,expectedMaxAgeMinutes,ageMinutes,detail:row?failed?`${Number(row.consecutive_failures||0)} consecutive failure(s)`:stale?lastSuccess?`Last success ${ageMinutes} minutes ago; expected within ${expectedMaxAgeMinutes}`:'No successful run recorded':'Running on schedule':'No heartbeat recorded yet',troubleshoot:def.troubleshoot};});
 const organizations=orgHealth.rows.map((o:any)=>{const issues=[] as string[];if(Number(o.admins)===0)issues.push('No active admin');if(Number(o.drivers)===0)issues.push('No active drivers');if(Number(o.aging_requests)>0)issues.push(`${o.aging_requests} aging ride request(s)`);if(Number(o.notification_failures)>0)issues.push(`${o.notification_failures} notification failure(s)`);if(Number(o.expiring_credentials)>0)issues.push(`${o.expiring_credentials} credential(s) expiring`);return{...o,issues,status:issues.length>=3?'failed':issues.length?'degraded':'healthy',troubleshoot:`/admin/operations?organizationId=${encodeURIComponent(o.id)}`};});
 const allStatuses=[...integrations.map(x=>x.status),...crons.map(x=>x.status),...organizations.map(x=>x.status)];
 return{generatedAt:new Date().toISOString(),overall:allStatuses.includes('failed')?'failed':allStatuses.includes('degraded')||allStatuses.includes('unknown')?'degraded':'healthy',integrations,crons,organizations,applicationErrors:applicationErrors.rows,summary:{healthy:allStatuses.filter(x=>x==='healthy').length,degraded:allStatuses.filter(x=>x==='degraded'||x==='unknown').length,failed:allStatuses.filter(x=>x==='failed').length}};
}
