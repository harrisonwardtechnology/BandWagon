import { NextResponse } from "next/server";
import { requireSessionIdentity } from "@/lib/auth";
import { getMyDriverSafetyStatus } from "@/lib/driver-eligibility";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(){
  try{
    const identity=await requireSessionIdentity();
    return NextResponse.json({ok:true,organizations:await getMyDriverSafetyStatus(identity.personId)});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Authentication required"},{status:401});
  }
}
