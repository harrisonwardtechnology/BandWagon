import { requireAdminTestToken } from "@/lib/admin-test";
import { getPlatformAdminOverview } from "@/lib/platform-admin";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request:Request){
  const denied=requireAdminTestToken(request);if(denied)return denied;
  try{return Response.json({ok:true,overview:await getPlatformAdminOverview()});}
  catch(error){return Response.json({error:error instanceof Error?error.message:"Unable to load platform overview"},{status:500});}
}
