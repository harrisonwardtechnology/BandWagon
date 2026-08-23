import crypto from "node:crypto";
import { syncSelectedGoogleCalendars } from "@/lib/google";
import { normalizeImportedCalendarEvents } from "@/lib/events";

export const runtime = "nodejs";
export const maxDuration = 60;

function valid(request: Request) {
  const configured = process.env.CALENDAR_SYNC_CRON_SECRET;
  if (!configured) return false;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const a = Buffer.from(configured);
  const b = Buffer.from(supplied);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!valid(request)) return new Response("Unauthorized", { status: 401 });
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
