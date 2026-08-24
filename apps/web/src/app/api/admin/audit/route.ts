import { requirePlatformRole } from "@/lib/auth";
import { auditExplorerFacets,queryAuditEvents } from "@/lib/audit-explorer";
import { auditEventsCsv } from "@/lib/audit-export";

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request:Request){
  try{
    await requirePlatformRole(['owner','support','readonly']);
    const url=new URL(request.url);const facets=url.searchParams.get('facets')==='1';
    if(facets)return Response.json({ok:true,facets:await auditExplorerFacets()});
    const exporting=url.searchParams.get('format')==='csv';
    const events=await queryAuditEvents({organizationId:url.searchParams.get('organizationId'),action:url.searchParams.get('action'),actor:url.searchParams.get('actor'),targetType:url.searchParams.get('targetType'),outcome:url.searchParams.get('outcome'),days:Number(url.searchParams.get('days')||30),limit:exporting?Number(url.searchParams.get('limit')||5000):Number(url.searchParams.get('limit')||100),offset:Number(url.searchParams.get('offset')||0),maximumLimit:exporting?10000:500});
    if(exporting){const stamp=new Date().toISOString().slice(0,10);return new Response(auditEventsCsv(events),{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="bandwagon-audit-${stamp}.csv"`,'cache-control':'no-store, private','x-content-type-options':'nosniff'}});}
    return Response.json({ok:true,events});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Audit access denied'},{status:403});}
}
