import crypto from "node:crypto";
import { dispatchRideReminders } from "@/lib/ride-reminders";
import { runCronWithHeartbeat } from "@/lib/cron-health";

export const runtime="nodejs";export const maxDuration=60;

function valid(request:Request){const configured=process.env.RIDE_REMINDER_CRON_SECRET||process.env.SAFETY_MAINTENANCE_CRON_SECRET;if(!configured)return false;const supplied=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"")||"";const a=Buffer.from(configured),b=Buffer.from(supplied);return a.length===b.length&&crypto.timingSafeEqual(a,b);}

export async function POST(request:Request){
  if(!valid(request))return new Response("Unauthorized",{status:401});
  try{return Response.json({ok:true,...await runCronWithHeartbeat({key:'ride-reminders',expectedMaxAgeMinutes:45,run:dispatchRideReminders})});}
  catch(error){return Response.json({ok:false,error:error instanceof Error?error.message:"Ride reminder dispatch failed"},{status:500});}
}
