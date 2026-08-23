import { evaluatePlatformBudget } from "@/lib/platform-budget";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function POST(request:Request){
 const configured=process.env.PLATFORM_BUDGET_CRON_SECRET;
 const supplied=request.headers.get("authorization")||"";
 if(!configured||supplied!==`Bearer ${configured}`)return Response.json({error:"Unauthorized"},{status:401});
 return Response.json({ok:true,result:await evaluatePlatformBudget()});
}
