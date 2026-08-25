import { requirePlatformRole } from "@/lib/auth";
import { notificationPolicySummary, routeNotification } from "@/lib/notification-router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizePhone(value: unknown) {
  const phone = String(value || "").trim();
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

export async function GET(request: Request) {
  try { await requirePlatformRole(["owner","support"]); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Platform administrator access is required" }, { status: 403 }); }
  return Response.json({ policies: notificationPolicySummary() });
}

export async function POST(request: Request) {
  try { await requirePlatformRole(["owner"]); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Platform owner access is required" }, { status: 403 }); }

  const body = await request.json().catch(() => ({}));
  const phone = body.phone ? normalizePhone(body.phone) : null;
  if (body.phone && !phone) {
    return Response.json({ error: "phone must be a valid E.164 number" }, { status: 400 });
  }

  const allowedPhone = process.env.ADMIN_TEST_PHONE
    ? normalizePhone(process.env.ADMIN_TEST_PHONE)
    : null;
  if(process.env.NODE_ENV==="production"&&!allowedPhone){
    return Response.json({error:"ADMIN_TEST_PHONE is required for production notification tests"},{status:503});
  }
  if (!phone) {
    return Response.json({ error: "A test phone is required" }, { status: 400 });
  }
  if (allowedPhone && phone !== allowedPhone) {
    return Response.json({ error: "This test tool is restricted to ADMIN_TEST_PHONE" }, { status: 403 });
  }

  try {
    const result = await routeNotification({
      notificationType:"platform_test",
      title:"BandWagon notification routing test",
      body:"BandWagon platform test: Transactional notification routing is working. Reply HELP for help or STOP to opt out.",
      url:"/notifications",
      phone,
      forceUrgency:"critical",
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Notification routing test failed" },
      { status: 500 }
    );
  }
}
