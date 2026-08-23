import { NextResponse } from "next/server";
import { requirePlatformRole, SUPPORT_COOKIE } from "@/lib/auth";
import { createSupportSession, findSupportTargets, listSupportHistory } from "@/lib/support-mode";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request:Request){
  try{
    await requirePlatformRole(['owner','support','readonly']);
    const url=new URL(request.url),q=url.searchParams.get('q')||'';
    return NextResponse.json({ok:true,targets:q?await findSupportTargets(q):[],history:await listSupportHistory(50)});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Platform support access is required'},{status:403});}
}

export async function POST(request:Request){
  try{
    const operator=await requirePlatformRole(['owner','support']);
    const body=await request.json().catch(()=>({}));
    if(body.action!=='start')return NextResponse.json({error:'Unknown action'},{status:400});
    const result=await createSupportSession({operatorUserAccountId:operator.userAccountId,targetUserAccountId:String(body.targetUserAccountId||''),targetOrganizationId:body.targetOrganizationId?String(body.targetOrganizationId):null,reason:String(body.reason||''),mode:body.mode==='assist'?'assist':'view',minutes:Number(body.minutes||30)});
    const response=NextResponse.json({ok:true,session:{id:result.session.id,mode:result.session.mode,reason:result.session.reason,expiresAt:result.session.expires_at,targetDisplayName:result.targetDisplayName}});
    response.cookies.set(SUPPORT_COOKIE,result.token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:60*Math.max(5,Math.min(60,Number(body.minutes||30)))});
    return response;
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to start Support Mode'},{status:400});}
}
