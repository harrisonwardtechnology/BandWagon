import { getDb } from "@/lib/db";
import { disconnectAutomaticDomain } from "@/lib/domain-setup-provider";
import { markOrganizationMonitoringForRemoval,syncStatusMonitoring } from "@/lib/status-monitoring";

function cloudflareConfigured(){return Boolean(process.env.CLOUDFLARE_API_TOKEN&&process.env.CLOUDFLARE_SAAS_ZONE_ID);}
async function deleteCloudflareHostname(id:string){
  if(!cloudflareConfigured())return{skipped:true,reason:'Cloudflare for SaaS is not configured'};
  const response=await fetch(`https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(process.env.CLOUDFLARE_SAAS_ZONE_ID!)}/custom_hostnames/${encodeURIComponent(id)}`,{method:'DELETE',headers:{authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,'content-type':'application/json'},cache:'no-store'});
  if(response.status===404)return{deleted:true,alreadyMissing:true};
  const body=await response.json().catch(()=>({}));if(!response.ok||body.success===false)throw new Error(body?.errors?.[0]?.message||`Cloudflare delete failed (${response.status})`);return{deleted:true};
}

export async function cleanupOrganizationInfrastructure(organizationId:string){
  const db=getDb();if(!db)throw new Error('Database is not configured');
  const domains=(await db.query(`select * from organization_domains where organization_id=$1 and domain_type='custom'`,[organizationId])).rows;
  const domainResults:any[]=[];
  for(const domain of domains){
    const result:any={domainId:domain.id,hostname:domain.hostname,dodomain:'skipped',cloudflare:'skipped'};
    try{if(domain.setup_provider==='dodomain'&&domain.setup_provider_connection_id){await disconnectAutomaticDomain(domain.setup_provider_connection_id);result.dodomain='removed';}}catch(error){result.dodomain='failed';result.dodomainError=error instanceof Error?error.message:'DoDomain disconnect failed';}
    try{if(domain.cloudflare_custom_hostname_id){await deleteCloudflareHostname(domain.cloudflare_custom_hostname_id);result.cloudflare='removed';}}catch(error){result.cloudflare='failed';result.cloudflareError=error instanceof Error?error.message:'Cloudflare cleanup failed';}
    const failed=result.dodomain==='failed'||result.cloudflare==='failed';
    await db.query(`update organization_domains set status=$2,dns_status=$3,ssl_status=$4,provider_monitor_status=$5,setup_status=case when $2='removed' then 'not_started' else setup_status end,setup_last_error=$6,updated_at=now() where id=$1`,[domain.id,failed?'suspended':'removed',failed?'failed':'removed',failed?'failed':'removed',failed?'failed':'disconnected',failed?JSON.stringify({dodomain:result.dodomainError||null,cloudflare:result.cloudflareError||null}):null]);
    domainResults.push(result);
  }
  await db.query(`update organization_domains set status='removed',dns_status='removed',ssl_status='removed',updated_at=now() where organization_id=$1 and domain_type='platform'`,[organizationId]);
  await db.query(`update google_connections set status='revoked',updated_at=now() where organization_id=$1 and status='active'`,[organizationId]).catch(()=>{});
  await markOrganizationMonitoringForRemoval(organizationId).catch(()=>{});
  const monitoring=await syncStatusMonitoring(25).catch(error=>({error:error instanceof Error?error.message:'Monitoring cleanup failed'}));
  const failedDomains=domainResults.filter(x=>x.dodomain==='failed'||x.cloudflare==='failed');
  return{ok:failedDomains.length===0,domains:domainResults,monitoring,googleConnections:'revoked',tenantHostname:'retired'};
}
