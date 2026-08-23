import { requirePlatformRole } from "@/lib/auth";
import { auditExplorerFacets,queryAuditEvents } from "@/lib/audit-explorer";

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request:Request){
  try{
    await requirePlatformRole(['owner','support','readonly']);
    const url=new URL(request.url);const facets=url.searchParams.get('facets')==='1';
    if(facets)return Response.json({ok:true,facets:await auditExplorerFacets()});
    const events=await queryAuditEvents({organizationId:url.searchParams.get('organizationId'),action:url.searchParams.get('action'),actor:url.searchParams.get('actor'),targetType:url.searchParams.get('targetType'),outcome:url.searchParams.get('outcome'),days:Number(url.searchParams.get('days')||30),limit:Number(url.searchParams.get('limit')||100),offset:Number(url.searchParams.get('offset')||0)});
    return Response.json({ok:true,events});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Audit access denied'},{status:403});}
}
