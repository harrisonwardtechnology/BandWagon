import { evaluatePlatformBudget } from "@/lib/platform-budget";
import { runCronWithHeartbeat } from "@/lib/cron-health";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function POST(request:Request){
 const configured=process.env.PLATFORM_BUDGET_CRON_SECRET;
 const supplied=request.headers.get("authorization")||"";
 if(!configured||supplied!==`Bearer ${configured}`)return Response.json({error:"Unauthorized"},{status:401});
 try{return Response.json({ok:true,result:await runCronWithHeartbeat({key:'platform-budget',expectedMaxAgeMinutes:2160,run:evaluatePlatformBudget})});}
 catch(error){return Response.json({ok:false,error:error instanceof Error?error.message:'Platform budget evaluation failed'},{status:500});}
}
