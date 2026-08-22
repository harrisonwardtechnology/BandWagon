import { requireAdminTestToken } from "@/lib/admin-test";
import { syncSelectedGoogleCalendars } from "@/lib/google";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const denied = requireAdminTestToken(request); if (denied) return denied;
  try { return Response.json({ ok: true, ...(await syncSelectedGoogleCalendars()) }); }
  catch (error) { return Response.json({ ok: false, error: error instanceof Error ? error.message : "Calendar sync failed" }, { status: 500 }); }
}
