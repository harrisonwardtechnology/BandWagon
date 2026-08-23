import { requireAdminTestToken } from "@/lib/admin-test";
import { syncSelectedGoogleCalendars } from "@/lib/google";
import { normalizeImportedCalendarEvents } from "@/lib/events";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const denied = requireAdminTestToken(request);
  if (denied) return denied;
  try {
    const sync = await syncSelectedGoogleCalendars();
    const normalized = await normalizeImportedCalendarEvents();
    return Response.json({ ok: true, ...sync, normalized });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Calendar sync failed" },
      { status: 500 }
    );
  }
}
