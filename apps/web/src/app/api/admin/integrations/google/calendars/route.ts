import { requireAdminTestToken } from "@/lib/admin-test";
import { listGoogleCalendars, setSelectedCalendars } from "@/lib/google";
export const runtime = "nodejs";
export async function GET(request: Request) { const denied = requireAdminTestToken(request); if (denied) return denied; return Response.json({ calendars: await listGoogleCalendars() }); }
export async function POST(request: Request) {
  const denied = requireAdminTestToken(request); if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const calendarIds = Array.isArray(body.calendarIds) ? body.calendarIds.filter((x: unknown): x is string => typeof x === "string") : [];
  await setSelectedCalendars(calendarIds); return Response.json({ ok: true, selected: calendarIds.length });
}
