import { requirePlatformRole } from "@/lib/auth";
import { syncSelectedGoogleCalendars } from "@/lib/google";
import { normalizeImportedCalendarEvents } from "@/lib/events";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try { await requirePlatformRole(["owner"]); }
  catch (error) { return Response.json({error:error instanceof Error?error.message:"Platform owner access is required"},{status:403}); }
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
