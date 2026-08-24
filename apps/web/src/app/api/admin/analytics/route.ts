import { requirePlatformRole } from "@/lib/auth";
import { getPlatformAnalytics } from "@/lib/platform-analytics";

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(){
  try{await requirePlatformRole(['owner','support','finance','readonly']);return Response.json({ok:true,analytics:await getPlatformAnalytics()});}
  catch(error){return Response.json({error:error instanceof Error?error.message:'Analytics access denied'},{status:403});}
}
