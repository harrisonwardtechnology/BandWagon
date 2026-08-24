import { getDb } from "@/lib/db";

export async function getCustomDomainHealth(){
  const db=getDb();if(!db)throw new Error("Database is not configured");
  const result=await db.query(`
    select d.id,d.organization_id,coalesce(o.display_name,o.name) as organization_name,d.hostname,d.status,d.dns_status,d.ssl_status,
      d.setup_mode,d.setup_provider,d.setup_status,d.provider_monitor_status,d.provider_last_event_type,d.provider_last_event_at,
      d.provider_last_verified_at,d.provider_last_failed_at,d.provider_failure_detail,d.last_checked_at
    from organization_domains d join organizations o on o.id=d.organization_id
    where d.domain_type='custom' and o.status in ('active','decommissioning')
    order by case when d.provider_monitor_status='failed' then 0 when d.provider_monitor_status='degraded' then 1 when d.status<>'active' then 2 else 3 end,
      coalesce(o.display_name,o.name),d.hostname`);
  const domains=result.rows.map((d:any)=>{
    const issues:string[]=[];
    if(d.setup_status==='failed')issues.push('Domain setup failed');
    if(d.provider_monitor_status==='failed')issues.push('DNS drift detected');
    if(d.provider_monitor_status==='disconnected')issues.push('DNS monitoring disconnected');
    if(d.dns_status&& !['active','verified'].includes(d.dns_status))issues.push(`DNS ${d.dns_status}`);
    if(d.ssl_status&& !['active','ready'].includes(d.ssl_status))issues.push(`TLS ${d.ssl_status}`);
    if(d.status!=='active'&&d.setup_status==='verified')issues.push('DNS verified but domain is not active');
    const status=issues.some(x=>x.includes('failed')||x.includes('drift')||x.includes('disconnected'))?'failed':issues.length?'degraded':'healthy';
    return{...d,issues,healthStatus:status};
  });
  return{
    domains,
    summary:{total:domains.length,healthy:domains.filter((d:any)=>d.healthStatus==='healthy').length,degraded:domains.filter((d:any)=>d.healthStatus==='degraded').length,failed:domains.filter((d:any)=>d.healthStatus==='failed').length,pending:domains.filter((d:any)=>d.status!=='active').length},
    provider:{dodomainConfigured:Boolean(process.env.DODOMAIN_SECRET_KEY),webhookConfigured:Boolean(process.env.DODOMAIN_WEBHOOK_SECRET),cloudflareConfigured:Boolean(process.env.CLOUDFLARE_API_TOKEN&&process.env.CLOUDFLARE_SAAS_ZONE_ID)}
  };
}
