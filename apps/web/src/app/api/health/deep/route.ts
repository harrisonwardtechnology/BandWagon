import { getPlatformHealth } from "@/lib/platform-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(){
  try{
    const health=await getPlatformHealth();
    const ok=health.overall!=="failed";
    return Response.json({ok,status:health.overall,generatedAt:health.generatedAt,summary:health.summary,integrations:health.integrations.map((x:any)=>({key:x.key,label:x.label,status:x.status,detail:x.detail})),crons:health.crons.map((x:any)=>({key:x.key,label:x.label,status:x.status,lastSuccess:x.lastSuccess,lastFailure:x.lastFailure,lastDurationMs:x.lastDurationMs,consecutiveFailures:x.consecutiveFailures,detail:x.detail}))},{status:ok?200:503,headers:{"cache-control":"no-store"}});
  }catch(error){return Response.json({ok:false,status:"failed",error:error instanceof Error?error.message:"Health check failed"},{status:503,headers:{"cache-control":"no-store"}});}
}
