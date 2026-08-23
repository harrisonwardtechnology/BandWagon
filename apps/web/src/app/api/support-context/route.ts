import { NextResponse } from "next/server";
import { getSessionIdentity } from "@/lib/auth";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(){
  const identity=await getSessionIdentity();
  if(!identity)return NextResponse.json({ok:true,supportMode:null});
  return NextResponse.json({ok:true,supportMode:identity.supportMode||null,viewingAs:identity.supportMode?{displayName:identity.displayName,personId:identity.personId,organizationIds:identity.organizationIds}:null});
}
