import { NextResponse } from "next/server";
import { requirePlatformRole } from "@/lib/auth";
import { getPlatformHealth } from "@/lib/platform-health";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(){
  try{
    await requirePlatformRole(['owner','support','readonly']);
    return NextResponse.json({ok:true,health:await getPlatformHealth()});
  }catch(error){
    const message=error instanceof Error?error.message:'Platform health access is required';
    return NextResponse.json({error:message},{status:message.includes('administrator')?403:500});
  }
}
