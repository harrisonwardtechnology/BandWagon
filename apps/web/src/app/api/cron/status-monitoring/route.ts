import { validCronBearer } from "@/lib/cron-auth";
import { runCronWithHeartbeat } from "@/lib/cron-health";
import { syncStatusMonitoring } from "@/lib/status-monitoring";

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function POST(request:Request){
  if(!validCronBearer(request,["STATUS_MONITORING_CRON_SECRET","PLATFORM_BUDGET_CRON_SECRET"]))return Response.json({error:"Unauthorized"},{status:401});
  try{return Response.json({ok:true,result:await runCronWithHeartbeat({key:'status-monitoring',expectedMaxAgeMinutes:30,run:()=>syncStatusMonitoring(75)})});}
  catch(error){return Response.json({ok:false,error:error instanceof Error?error.message:'Status monitoring sync failed'},{status:500});}
}
