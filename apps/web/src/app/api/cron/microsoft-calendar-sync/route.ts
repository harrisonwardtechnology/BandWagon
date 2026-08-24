import crypto from "node:crypto";
import { syncAllMicrosoftCalendars } from "@/lib/microsoft";
import { normalizeImportedCalendarEvents } from "@/lib/events";
import { runCronWithHeartbeat } from "@/lib/cron-health";
export const runtime="nodejs";export const maxDuration=60;
function valid(request:Request){const configured=process.env.CALENDAR_SYNC_CRON_SECRET;if(!configured)return false;const supplied=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"")||"",a=Buffer.from(configured),b=Buffer.from(supplied);return a.length===b.length&&crypto.timingSafeEqual(a,b);}
export async function POST(request:Request){if(!valid(request))return new Response("Unauthorized",{status:401});try{const result=await runCronWithHeartbeat({key:"microsoft-calendar-sync",expectedMaxAgeMinutes:180,run:async()=>{const sync=await syncAllMicrosoftCalendars(),normalized=await normalizeImportedCalendarEvents();return{...sync,normalized};}});return Response.json({ok:true,...result});}catch(error){return Response.json({ok:false,error:error instanceof Error?error.message:"Microsoft Calendar sync failed"},{status:500});}}
