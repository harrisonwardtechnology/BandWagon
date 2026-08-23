import { NextResponse } from "next/server";
import { requireSessionIdentity } from "@/lib/auth";
import { getNotificationPreferences,updateNotificationPreferences } from "@/lib/notification-preferences";

export const runtime="nodejs";export const dynamic="force-dynamic";

export async function GET(request:Request){
  try{const identity=await requireSessionIdentity();const organizationId=new URL(request.url).searchParams.get("organizationId");return NextResponse.json({ok:true,...await getNotificationPreferences(identity,organizationId||null)});}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to load notification preferences"},{status:400});}
}

export async function POST(request:Request){
  try{const identity=await requireSessionIdentity();const body=await request.json().catch(()=>({}));return NextResponse.json({ok:true,...await updateNotificationPreferences(identity,{organizationId:body.organizationId||null,pushEnabled:body.pushEnabled,emailEnabled:body.emailEnabled,smsEnabled:body.smsEnabled,smsForCriticalOnly:body.smsForCriticalOnly,reminderPushEnabled:body.reminderPushEnabled,reminderEmailEnabled:body.reminderEmailEnabled,reminderSmsEnabled:body.reminderSmsEnabled})});}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to update notification preferences"},{status:400});}
}
