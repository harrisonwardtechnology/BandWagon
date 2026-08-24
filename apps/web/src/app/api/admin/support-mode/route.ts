import { NextResponse } from "next/server";
import { requireBaseSessionIdentity, SUPPORT_COOKIE } from "@/lib/auth";
import { createSupportSession, findSupportTargets, getSupportAccess, listSupportHistory } from "@/lib/support-mode";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request:Request){
  try{
    const operator=await requireBaseSessionIdentity();
    const access=await getSupportAccess(operator.userAccountId);
    if(!access.platformView&&!access.organizations.length)throw new Error("Support View access is required");
    const url=new URL(request.url),q=url.searchParams.get('q')||'',requestedOrg=url.searchParams.get('organizationId');
    let scopeIds:string[]|null=null;
    if(!access.platformView){
      const allowed=access.organizations.map((o:any)=>String(o.id));
      if(requestedOrg&&!allowed.includes(requestedOrg))throw new Error("Organization administrator access is required");
      scopeIds=requestedOrg?[requestedOrg]:allowed;
    }else if(requestedOrg){scopeIds=[requestedOrg];}
    return NextResponse.json({
      ok:true,
      access:{platformView:access.platformView,platformStart:access.platformStart,platformRole:access.platformRole,organizations:access.organizations},
      targets:q?await findSupportTargets(q,scopeIds):[],
      history:await listSupportHistory(50,access.platformView?null:access.organizations.map((o:any)=>String(o.id))),
    });
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Support View access is required'},{status:403});}
}

export async function POST(request:Request){
  try{
    const operator=await requireBaseSessionIdentity();
    const body=await request.json().catch(()=>({}));
    if(body.action!=='start')return NextResponse.json({error:'Unknown action'},{status:400});
    const result=await createSupportSession({operatorUserAccountId:operator.userAccountId,targetUserAccountId:String(body.targetUserAccountId||''),targetOrganizationId:body.targetOrganizationId?String(body.targetOrganizationId):null,reason:String(body.reason||''),mode:body.mode==='assist'?'assist':'view',minutes:Number(body.minutes||30)});
    const response=NextResponse.json({ok:true,session:{id:result.session.id,mode:result.session.mode,reason:result.session.reason,expiresAt:result.session.expires_at,targetDisplayName:result.targetDisplayName,targetOrganizationId:result.session.target_organization_id}});
    response.cookies.set(SUPPORT_COOKIE,result.token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',priority:'high',path:'/',maxAge:60*Math.max(5,Math.min(60,Number(body.minutes||30)))});
    return response;
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to start Support View'},{status:400});}
}
