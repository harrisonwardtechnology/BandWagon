import { requireAdminTestToken } from "@/lib/admin-test";
import { getBaseSessionIdentity } from "@/lib/auth";
import { getPlatformAdminOverview } from "@/lib/platform-admin";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request:Request){
  try{
    const identity=await getBaseSessionIdentity();
    const role=identity?.platformRole;
    if(!role||!['owner','support','finance','readonly'].includes(role)){
      const denied=requireAdminTestToken(request);if(denied)return denied;
    }
    return Response.json({ok:true,overview:await getPlatformAdminOverview(),platformRole:role||null});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"Unable to load platform overview"},{status:500});}
}
