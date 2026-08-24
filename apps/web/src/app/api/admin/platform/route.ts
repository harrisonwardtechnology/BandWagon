import { requirePlatformRole } from "@/lib/auth";
import { getPlatformAdminOverview } from "@/lib/platform-admin";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request:Request){
  try{
    const identity=await requirePlatformRole(["owner","support","finance","readonly"]);
    return Response.json({ok:true,overview:await getPlatformAdminOverview(),platformRole:identity.platformRole});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"Unable to load platform overview"},{status:403});}
}
