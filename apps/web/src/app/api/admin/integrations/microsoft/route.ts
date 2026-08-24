import { requireSessionIdentity } from "@/lib/auth";
import { assertIdentityOrganizationAdmin, listOrganizationsForAdministrator } from "@/lib/admin-access";
import { microsoftAuthorizationUrl, microsoftIntegrationStatus } from "@/lib/microsoft";

export const runtime="nodejs";export const dynamic="force-dynamic";
const privateResponse={headers:{"cache-control":"no-store, private"}};

export async function GET(request:Request){
  try{const identity=await requireSessionIdentity(),organizationId=new URL(request.url).searchParams.get("organizationId");const organizations=await listOrganizationsForAdministrator();
    if(!organizationId)return Response.json({ok:true,organizations,status:null},privateResponse);
    await assertIdentityOrganizationAdmin(identity,organizationId,{write:false});return Response.json({ok:true,organizations,status:await microsoftIntegrationStatus(organizationId)},privateResponse);
  }catch(error){return Response.json({error:error instanceof Error?error.message:"Administrator access required"},{status:403,...privateResponse});}
}
export async function POST(request:Request){
  try{const identity=await requireSessionIdentity(),body=await request.json().catch(()=>({})),organizationId=String(body.organizationId||"");await assertIdentityOrganizationAdmin(identity,organizationId);
    return Response.json({ok:true,authorizationUrl:microsoftAuthorizationUrl(organizationId)},privateResponse);
  }catch(error){return Response.json({error:error instanceof Error?error.message:"Unable to start Microsoft connection"},{status:400,...privateResponse});}
}
