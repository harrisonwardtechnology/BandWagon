import { requireAdminTestToken } from "@/lib/admin-test";
import { evaluatePlatformBudget,getPlatformCostSnapshot,setPlatformBudget } from "@/lib/platform-budget";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request:Request){
 const denied=requireAdminTestToken(request);if(denied)return denied;
 const url=new URL(request.url),month=url.searchParams.get("month")||undefined;
 return Response.json({ok:true,snapshot:await getPlatformCostSnapshot(month)});
}

export async function POST(request:Request){
 const denied=requireAdminTestToken(request);if(denied)return denied;
 const body=await request.json().catch(()=>({}));
 if(body.action==="evaluate")return Response.json({ok:true,result:await evaluatePlatformBudget(body.month||undefined)});
 const budgetDollars=Number(body.budgetDollars||0),fixedMonthlyCostDollars=Number(body.fixedMonthlyCostDollars||0);
 if(!Number.isFinite(budgetDollars)||budgetDollars<=0)return Response.json({error:"budgetDollars must be greater than zero"},{status:400});
 if(!Number.isFinite(fixedMonthlyCostDollars)||fixedMonthlyCostDollars<0)return Response.json({error:"fixedMonthlyCostDollars must be zero or greater"},{status:400});
 const recipients=Array.isArray(body.alertRecipients)?body.alertRecipients.map(String):String(body.alertRecipients||"").split(/[;,\n]/).map((v:string)=>v.trim()).filter(Boolean);
 const budget=await setPlatformBudget({budgetMonth:body.month||undefined,budgetCents:Math.round(budgetDollars*100),fixedMonthlyCostCents:Math.round(fixedMonthlyCostDollars*100),alertRecipients:recipients,enabled:body.enabled!==false});
 return Response.json({ok:true,budget,snapshot:await getPlatformCostSnapshot(body.month||undefined)});
}
