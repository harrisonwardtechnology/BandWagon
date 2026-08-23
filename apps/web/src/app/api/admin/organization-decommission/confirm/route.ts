import { requireBaseSessionIdentity } from "@/lib/auth";
import { confirmOrganizationDecommission } from "@/lib/organization-decommission";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function POST(request:Request){
  try{
    const body=await request.json().catch(()=>({}));
    const token=String(body.token||'').trim();
    if(token){const result=await confirmOrganizationDecommission({token,channel:'email_link'});return Response.json({ok:true,...result});}
    const organizationId=String(body.organizationId||'').trim();
    const code=String(body.code||'').trim();
    const identity=await requireBaseSessionIdentity();
    const result=await confirmOrganizationDecommission({organizationId,code,personId:identity.personId,channel:'code'});
    return Response.json({ok:true,...result});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Unable to confirm organization removal'},{status:400});}
}
