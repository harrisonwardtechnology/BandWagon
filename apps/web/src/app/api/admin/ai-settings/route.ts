import { NextResponse } from "next/server";
import { requireSessionIdentity } from "@/lib/auth";
import { listAdminOrganizations } from "@/lib/admin-operations";
import { getOrganizationAiSettingsForAdmin,ORG_AI_FEATURES,ORG_AI_CONSENT_VERSION,updateOrganizationAiSettings } from "@/lib/org-ai";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request:Request){
  try{
    const identity=await requireSessionIdentity();const url=new URL(request.url);const organizationId=url.searchParams.get("organizationId");
    const organizations=await listAdminOrganizations(identity);
    if(!organizationId)return NextResponse.json({ok:true,organizations,settings:null,features:ORG_AI_FEATURES,consentVersion:ORG_AI_CONSENT_VERSION});
    return NextResponse.json({ok:true,organizations,settings:await getOrganizationAiSettingsForAdmin(identity,organizationId),features:ORG_AI_FEATURES,consentVersion:ORG_AI_CONSENT_VERSION});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Administrator access required"},{status:403});}
}

export async function POST(request:Request){
  try{
    const identity=await requireSessionIdentity();const body=await request.json().catch(()=>({}));
    if(body.action!=="update")return NextResponse.json({error:"Unknown action"},{status:400});
    const settings=await updateOrganizationAiSettings(identity,{
      organizationId:String(body.organizationId||""),aiEnabled:Boolean(body.aiEnabled),
      documentReviewEnabled:Boolean(body.documentReviewEnabled),eventIntakeEnabled:Boolean(body.eventIntakeEnabled),
      matchExplanationsEnabled:Boolean(body.matchExplanationsEnabled),adminCopilotEnabled:Boolean(body.adminCopilotEnabled),
      safetySummariesEnabled:Boolean(body.safetySummariesEnabled),monthlyBudgetCents:body.monthlyBudgetCents==null?null:Number(body.monthlyBudgetCents),
    });
    return NextResponse.json({ok:true,settings,features:ORG_AI_FEATURES,consentVersion:ORG_AI_CONSENT_VERSION});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to update AI settings"},{status:400});}
}
