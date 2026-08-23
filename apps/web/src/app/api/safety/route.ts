import { NextResponse } from "next/server";
import { requireSessionIdentity } from "@/lib/auth";
import { listMySafetyContext,resolveSafetyAlert,triggerSafetyAlert } from "@/lib/safety";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(){
  try{
    const identity=await requireSessionIdentity();
    return NextResponse.json({ok:true,context:await listMySafetyContext(identity)});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Authentication required"},{status:401});
  }
}

export async function POST(request:Request){
  try{
    const identity=await requireSessionIdentity();
    const body=await request.json().catch(()=>({}));
    if(body.action==="trigger"){
      const result=await triggerSafetyAlert(identity,{
        rideId:String(body.rideId||""),alertType:body.alertType||"help",message:body.message||null,
        latitude:body.latitude==null?null:Number(body.latitude),longitude:body.longitude==null?null:Number(body.longitude),
        generalizedArea:body.generalizedArea||null,
      });
      return NextResponse.json({ok:true,result,context:await listMySafetyContext(identity)});
    }
    if(body.action==="resolve"){
      const result=await resolveSafetyAlert(identity,String(body.alertId||""));
      return NextResponse.json({ok:true,result,context:await listMySafetyContext(identity)});
    }
    return NextResponse.json({error:"Unknown action"},{status:400});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Safety action failed"},{status:400});
  }
}
