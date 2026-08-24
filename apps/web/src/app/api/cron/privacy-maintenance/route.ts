import crypto from "node:crypto";
import { runCronWithHeartbeat } from "@/lib/cron-health";
import { processPrivacyMaintenance } from "@/lib/privacy-maintenance";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request) {
  const configured = process.env.PRIVACY_MAINTENANCE_CRON_SECRET || process.env.SAFETY_CRON_SECRET;
  if (!configured) return false;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const expectedBuffer = Buffer.from(configured);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export async function POST(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  try {
    return Response.json({
      ok: true,
      ...(await runCronWithHeartbeat({
        key: "privacy-maintenance",
        expectedMaxAgeMinutes: 180,
        run: processPrivacyMaintenance,
      })),
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Privacy maintenance failed" },
      { status: 500 }
    );
  }
}
