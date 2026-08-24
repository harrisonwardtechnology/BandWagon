import { requirePlatformRole } from "@/lib/auth";
import { listGoogleCalendars, setSelectedCalendars } from "@/lib/google";
export const runtime = "nodejs";
export async function GET() { try { await requirePlatformRole(["owner","support"]); return Response.json({ calendars: await listGoogleCalendars() }); } catch (error) { return Response.json({error:error instanceof Error?error.message:"Platform administrator access is required"},{status:403}); } }
export async function POST(request: Request) {
  try { await requirePlatformRole(["owner"]); }
  catch (error) { return Response.json({error:error instanceof Error?error.message:"Platform owner access is required"},{status:403}); }
  const body = await request.json().catch(() => ({}));
  const calendarIds = Array.isArray(body.calendarIds) ? body.calendarIds.filter((x: unknown): x is string => typeof x === "string") : [];
  await setSelectedCalendars(calendarIds); return Response.json({ ok: true, selected: calendarIds.length });
}
