import { NextResponse } from "next/server";
import { requireSessionIdentity } from "@/lib/auth";
import { createEventIntakeDraft,listEventIntakeDrafts,publishEventIntakeDraft,rejectEventIntakeDraft } from "@/lib/event-intake";

export const runtime="nodejs";export const dynamic="force-dynamic";export const maxDuration=60;

export async function GET(request:Request){
  try{const identity=await requireSessionIdentity();const organizationId=new URL(request.url).searchParams.get("organizationId");if(!organizationId)return NextResponse.json({error:"organizationId is required"},{status:400});return NextResponse.json({ok:true,drafts:await listEventIntakeDrafts(identity,organizationId)});}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to load event drafts"},{status:400});}
}

export async function POST(request:Request){
  try{const identity=await requireSessionIdentity();const body=await request.json().catch(()=>({}));
    if(body.action==="analyze")return NextResponse.json({ok:true,result:await createEventIntakeDraft(identity,{organizationId:String(body.organizationId||""),text:String(body.text||"")})});
    if(body.action==="publish")return NextResponse.json({ok:true,result:await publishEventIntakeDraft(identity,{draftId:String(body.draftId||""),proposal:body.proposal||null})});
    if(body.action==="reject")return NextResponse.json({ok:true,result:await rejectEventIntakeDraft(identity,String(body.draftId||""))});
    return NextResponse.json({error:"Unknown action"},{status:400});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Event intake failed"},{status:400});}
}
