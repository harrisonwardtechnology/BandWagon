import { requirePlatformRole } from "@/lib/auth";
import { getSecurityReport,listSecurityReports,updateSecurityReport } from "@/lib/security-report-admin";

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request:Request){
  try{
    await requirePlatformRole(['owner','support','readonly']);
    const url=new URL(request.url);const reportId=url.searchParams.get('reportId');
    if(reportId)return Response.json({ok:true,...await getSecurityReport(reportId)});
    return Response.json({ok:true,reports:await listSecurityReports({status:url.searchParams.get('status'),severity:url.searchParams.get('severity'),limit:Number(url.searchParams.get('limit')||100)})});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Security report access denied'},{status:403});}
}

export async function POST(request:Request){
  try{
    const identity=await requirePlatformRole(['owner','support']);
    const body=await request.json().catch(()=>({}));
    const reportId=String(body.reportId||'');if(!reportId)return Response.json({error:'reportId is required'},{status:400});
    const result=await updateSecurityReport({reportId,actorUserAccountId:identity.userAccountId,status:body.status?String(body.status):null,bountyStatus:body.bountyStatus?String(body.bountyStatus):null,bountyAmountCents:body.bountyAmountCents==null?null:Number(body.bountyAmountCents),assignToSelf:Boolean(body.assignToSelf),internalNote:body.internalNote?String(body.internalNote):null,publicMessage:body.publicMessage?String(body.publicMessage):null,remediationReference:body.remediationReference==null?null:String(body.remediationReference)});
    return Response.json({ok:true,...result});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Unable to update security report'},{status:400});}
}
