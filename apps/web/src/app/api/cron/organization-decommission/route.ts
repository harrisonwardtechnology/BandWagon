import { runCronWithHeartbeat } from "@/lib/cron-health";
import { processOrganizationDecommissions } from "@/lib/organization-decommission-worker";

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function POST(request:Request){
  const configured=process.env.DECOMMISSION_CRON_SECRET||process.env.PLATFORM_BUDGET_CRON_SECRET;
  const supplied=request.headers.get('authorization')||'';
  if(!configured||supplied!==`Bearer ${configured}`)return Response.json({error:'Unauthorized'},{status:401});
  try{return Response.json({ok:true,result:await runCronWithHeartbeat({key:'organization-decommission',expectedMaxAgeMinutes:180,run:()=>processOrganizationDecommissions(10)})});}
  catch(error){return Response.json({ok:false,error:error instanceof Error?error.message:'Organization decommission worker failed'},{status:500});}
}
