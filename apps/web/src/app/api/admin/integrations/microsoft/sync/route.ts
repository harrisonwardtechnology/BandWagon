import { requireSessionIdentity } from "@/lib/auth";
import { assertIdentityOrganizationAdmin } from "@/lib/admin-access";
import { syncSelectedMicrosoftCalendars } from "@/lib/microsoft";
import { normalizeImportedCalendarEvents } from "@/lib/events";
export const runtime="nodejs";export const maxDuration=60;
export async function POST(request:Request){try{const identity=await requireSessionIdentity(),body=await request.json().catch(()=>({})),organizationId=String(body.organizationId||"");await assertIdentityOrganizationAdmin(identity,organizationId);const sync=await syncSelectedMicrosoftCalendars(organizationId),normalized=await normalizeImportedCalendarEvents();return Response.json({ok:true,...sync,normalized});}catch(error){return Response.json({ok:false,error:error instanceof Error?error.message:"Microsoft Calendar sync failed"},{status:500});}}
