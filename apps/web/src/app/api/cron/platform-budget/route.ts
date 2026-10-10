import { evaluatePlatformBudget } from "@/lib/platform-budget";
import { validCronBearer } from "@/lib/cron-auth";
import { runCronWithHeartbeat } from "@/lib/cron-health";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function POST(request:Request){
  if(!validCronBearer(request,["PLATFORM_BUDGET_CRON_SECRET"]))return Response.json({error:"Unauthorized"},{status:401});
 try{return Response.json({ok:true,result:await runCronWithHeartbeat({key:'platform-budget',expectedMaxAgeMinutes:2160,run:evaluatePlatformBudget})});}
 catch(error){return Response.json({ok:false,error:error instanceof Error?error.message:'Platform budget evaluation failed'},{status:500});}
}
