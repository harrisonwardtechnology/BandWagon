import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireBaseSessionIdentity, SUPPORT_COOKIE } from "@/lib/auth";
import { endSupportSession } from "@/lib/support-mode";

export const runtime="nodejs";

export async function POST(){
  try{
    const operator=await requireBaseSessionIdentity();
    const store=await cookies();const token=store.get(SUPPORT_COOKIE)?.value||null;
    await endSupportSession({operatorUserAccountId:operator.userAccountId,token});
    const response=NextResponse.json({ok:true});
    response.cookies.set(SUPPORT_COOKIE,"",{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',priority:'high',path:'/',maxAge:0});
    return response;
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to end Support Mode'},{status:400});}
}
