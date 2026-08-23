import { NextResponse } from "next/server";
import { requirePlatformRole } from "@/lib/auth";
import { getPlatformHealth } from "@/lib/platform-health";
import { getCustomDomainHealth } from "@/lib/domain-health";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(){
  try{
    await requirePlatformRole(['owner','support','readonly']);
    const [base,customDomains]=await Promise.all([getPlatformHealth(),getCustomDomainHealth()]);
    const health:any={...base,customDomains:customDomains.domains,domainSummary:customDomains.summary,domainProviders:customDomains.provider};
    health.summary={
      healthy:Number(base.summary.healthy||0)+customDomains.summary.healthy,
      degraded:Number(base.summary.degraded||0)+customDomains.summary.degraded,
      failed:Number(base.summary.failed||0)+customDomains.summary.failed,
    };
    if(customDomains.summary.failed>0)health.overall='failed';
    else if(customDomains.summary.degraded>0&&health.overall==='healthy')health.overall='degraded';
    return NextResponse.json({ok:true,health});
  }catch(error){
    const message=error instanceof Error?error.message:'Platform health access is required';
    return NextResponse.json({error:message},{status:message.includes('administrator')?403:500});
  }
}
