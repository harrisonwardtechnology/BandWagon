import { getDb } from "@/lib/db";
import { requireBaseSessionIdentity } from "@/lib/auth";
import { previewOrganizationDecommission,createOrganizationDecommissionConfirmation,listOrganizationDecommissions } from "@/lib/organization-decommission";

export const runtime="nodejs";
export const dynamic="force-dynamic";

async function requireOrgDecommissionAccess(organizationId:string){
  const identity=await requireBaseSessionIdentity();
  if(identity.platformRole==='owner')return{identity,scope:'platform' as const};
  const db=getDb();if(!db)throw new Error('Database is not configured');
  const result=await db.query(`select m.role from memberships m where m.organization_id=$1 and m.person_id=$2 and m.group_id is null and m.status='active' and m.role in ('owner','admin') limit 1`,[organizationId,identity.personId]);
  if(!result.rowCount)throw new Error('Organization owner or administrator access is required');
  return{identity,scope:'organization' as const,organizationRole:result.rows[0].role};
}

export async function GET(request:Request){
  try{
    const url=new URL(request.url);const organizationId=String(url.searchParams.get('organizationId')||'');
    if(!organizationId)return Response.json({error:'organizationId is required'},{status:400});
    await requireOrgDecommissionAccess(organizationId);
    const [preview,history]=await Promise.all([previewOrganizationDecommission(organizationId),listOrganizationDecommissions(organizationId)]);
    return Response.json({ok:true,preview,history});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Unable to load decommission preview'},{status:403});}
}

export async function POST(request:Request){
  try{
    const body=await request.json().catch(()=>({}));const organizationId=String(body.organizationId||'');
    if(!organizationId)return Response.json({error:'organizationId is required'},{status:400});
    const access=await requireOrgDecommissionAccess(organizationId);
    const emergency=Boolean(body.emergency);
    if(emergency&&access.identity.platformRole!=='owner')return Response.json({error:'Only a Platform Owner can force emergency decommission while active rides exist'},{status:403});
    const result=await createOrganizationDecommissionConfirmation({organizationId,confirmation:String(body.confirmation||''),reason:String(body.reason||''),emergency,requestedByPersonId:access.identity.personId,requestedByPlatformRole:access.identity.platformRole||null});
    return Response.json({ok:true,confirmationRequired:true,...result});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Unable to request organization decommission'},{status:400});}
}
