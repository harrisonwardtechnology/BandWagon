import { NextResponse } from "next/server";
import { requireSessionIdentity } from "@/lib/auth";
import { getOperationsDashboard,listAdminOrganizations,reviewDriverRequirement,updateDriverRequirements } from "@/lib/admin-operations";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request:Request){
  try{
    const identity=await requireSessionIdentity();const url=new URL(request.url);const organizationId=url.searchParams.get("organizationId");
    const organizations=await listAdminOrganizations(identity);
    if(!organizationId)return NextResponse.json({ok:true,organizations,dashboard:null});
    return NextResponse.json({ok:true,organizations,dashboard:await getOperationsDashboard(identity,organizationId)});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Administrator access required"},{status:403});}
}

export async function POST(request:Request){
  try{
    const identity=await requireSessionIdentity();const body=await request.json().catch(()=>({}));let result:any;
    if(body.action==="review_requirement")result=await reviewDriverRequirement(identity,{organizationId:String(body.organizationId||""),driverPersonId:String(body.driverPersonId||""),requirementType:String(body.requirementType||""),approve:Boolean(body.approve),expiresAt:body.expiresAt||null,notes:body.notes||null});
    else if(body.action==="update_requirements")result=await updateDriverRequirements(identity,body);
    else return NextResponse.json({error:"Unknown action"},{status:400});
    return NextResponse.json({ok:true,result,dashboard:await getOperationsDashboard(identity,String(body.organizationId||""))});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Administrator action failed"},{status:400});}
}
