import { getDb } from "@/lib/db";

function dbRequired(){const db=getDb();if(!db)throw new Error('Database is not configured');return db;}
function bridgeConfigured(){return Boolean(process.env.STATUS_MONITOR_BRIDGE_URL&&process.env.STATUS_MONITOR_BRIDGE_TOKEN);}
function bridgeBase(){return String(process.env.STATUS_MONITOR_BRIDGE_URL||'').replace(/\/$/,'');}
async function bridge(path:string,init:RequestInit={}){
  if(!bridgeConfigured())throw new Error('Status monitoring bridge is not configured');
  const response=await fetch(`${bridgeBase()}${path}`,{...init,headers:{authorization:`Bearer ${process.env.STATUS_MONITOR_BRIDGE_TOKEN}`,'content-type':'application/json',...(init.headers||{})},cache:'no-store'});
  const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body?.error||body?.message||`Monitoring bridge failed (${response.status})`);return body;
}

export async function ensureOrganizationMonitoringRegistration(organizationId:string){
  const db=dbRequired();
  const org=(await db.query(`select id,coalesce(display_name,name) as name,slug,tenant_hostname,status from organizations where id=$1 limit 1`,[organizationId])).rows[0];
  if(!org)throw new Error('Organization not found');
  const hostname=String(org.tenant_hostname||'').trim();if(!hostname)throw new Error('Organization has no tenant hostname');
  const monitorKey=`community:${org.id}`;const targetUrl=`https://${hostname}/api/health/ready`;
  return (await db.query(`insert into status_monitoring_registrations(organization_id,monitor_key,display_name,target_url,desired_state,status,updated_at)
    values($1,$2,$3,$4,'active','pending',now()) on conflict(organization_id) do update set monitor_key=excluded.monitor_key,display_name=excluded.display_name,target_url=excluded.target_url,desired_state='active',status=case when status_monitoring_registrations.status='removed' then 'pending' else status_monitoring_registrations.status end,updated_at=now() returning *`,[organizationId,monitorKey,org.name,targetUrl])).rows[0];
}

export async function markOrganizationMonitoringForRemoval(organizationId:string){
  const db=dbRequired();
  await db.query(`update status_monitoring_registrations set desired_state='removed',status=case when status='removed' then status else 'removing' end,updated_at=now() where organization_id=$1`,[organizationId]);
}

async function checkReadiness(url:string){
  try{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),7000);const response=await fetch(url,{method:'GET',cache:'no-store',signal:controller.signal,headers:{'user-agent':'BandWagon-StatusProvisioner/1.0'}});clearTimeout(timer);return{ok:response.ok,status:response.status};}
  catch(error){return{ok:false,status:0,error:error instanceof Error?error.message:'Readiness check failed'};}
}

export async function syncStatusMonitoring(limit=50){
  const db=dbRequired();
  const rows=(await db.query(`select r.*,o.status as organization_status from status_monitoring_registrations r join organizations o on o.id=r.organization_id where (r.desired_state='active' and r.status<>'active') or (r.desired_state='removed' and r.status<>'removed') or (r.desired_state='active' and r.status='active' and coalesce(r.last_sync_at,'epoch'::timestamptz)<now()-interval '24 hours') order by r.updated_at asc limit $1`,[Math.max(1,Math.min(200,limit))])).rows;
  const results:any[]=[];
  for(const row of rows){
    try{
      if(row.desired_state==='removed'||row.organization_status==='decommissioning'){
        await db.query(`update status_monitoring_registrations set status='removing',attempt_count=attempt_count+1,last_sync_at=now(),updated_at=now() where id=$1`,[row.id]);
        if(bridgeConfigured()&&row.provider_monitor_id){await bridge(`/v1/monitors/${encodeURIComponent(row.monitor_key)}`,{method:'DELETE'});}
        await db.query(`update status_monitoring_registrations set status='removed',provider_monitor_id=null,provider_public_component_id=null,last_success_at=now(),last_error=null,updated_at=now() where id=$1`,[row.id]);
        results.push({id:row.id,action:'removed',ok:true});continue;
      }
      const ready=await checkReadiness(row.target_url);
      await db.query(`update status_monitoring_registrations set readiness_status=$2,readiness_checked_at=now(),status=case when $2='healthy' then 'provisioning' else 'waiting_ready' end,attempt_count=attempt_count+1,last_sync_at=now(),last_error=case when $2='healthy' then null else $3 end,updated_at=now() where id=$1`,[row.id,ready.ok?'healthy':'unhealthy',ready.ok?null:(ready.error||`Readiness returned ${ready.status}`)]);
      if(!ready.ok){results.push({id:row.id,action:'wait_ready',ok:false,status:ready.status});continue;}
      if(!bridgeConfigured()){
        await db.query(`update status_monitoring_registrations set status='pending',last_error='Monitoring bridge is not configured',updated_at=now() where id=$1`,[row.id]);
        results.push({id:row.id,action:'pending_bridge',ok:false});continue;
      }
      const provisioned=await bridge('/v1/monitors/upsert',{method:'POST',body:JSON.stringify({externalId:row.monitor_key,name:row.display_name,url:row.target_url,publicGroup:row.public_group,intervalSeconds:60,expectedStatus:[200,299]})});
      await db.query(`update status_monitoring_registrations set status='active',provider_monitor_id=$2,provider_public_component_id=$3,last_success_at=now(),last_error=null,metadata=metadata||$4::jsonb,updated_at=now() where id=$1`,[row.id,String(provisioned.monitorId||provisioned.id||row.monitor_key),provisioned.publicComponentId?String(provisioned.publicComponentId):null,JSON.stringify({lastProvisionResponse:{provider:provisioned.provider||'uptime_kuma'}})]);
      results.push({id:row.id,action:'upsert',ok:true});
    }catch(error){await db.query(`update status_monitoring_registrations set status='failed',last_error=$2,updated_at=now() where id=$1`,[row.id,error instanceof Error?error.message:'Monitoring sync failed']).catch(()=>{});results.push({id:row.id,action:'sync',ok:false,error:error instanceof Error?error.message:'Monitoring sync failed'});}
  }
  return{processed:results.length,bridgeConfigured:bridgeConfigured(),results};
}

export async function statusMonitoringSummary(){
  const db=dbRequired();
  const summary=await db.query(`select count(*)::int as total,count(*) filter(where status='active')::int as active,count(*) filter(where status in ('pending','waiting_ready','provisioning'))::int as pending,count(*) filter(where status='failed')::int as failed,count(*) filter(where status='removed')::int as removed,max(last_success_at) as last_success from status_monitoring_registrations`);
  const failures=await db.query(`select r.organization_id,r.display_name,r.status,r.target_url,r.last_error,r.last_sync_at from status_monitoring_registrations r where r.status in ('failed','waiting_ready') order by r.updated_at desc limit 25`);
  return{...summary.rows[0],bridgeConfigured:bridgeConfigured(),failures:failures.rows};
}
