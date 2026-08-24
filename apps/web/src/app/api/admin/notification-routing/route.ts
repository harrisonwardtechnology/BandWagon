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
  if (phone && allowedPhone && phone !== allowedPhone) {
    return Response.json({ error: "This test tool is restricted to ADMIN_TEST_PHONE" }, { status: 403 });
  }

  const notificationType = String(body.notificationType || "platform_test");
  const title = String(body.title || "BandWagon notification routing test").trim();
  const message = String(body.body || "Push-first notification routing is working.").trim();

  if (!title || !message || message.length > 1000) {
    return Response.json({ error: "Invalid notification title/body" }, { status: 400 });
  }

  try {
    const result = await routeNotification({
      notificationType,
      title,
      body: message,
      url: typeof body.url === "string" ? body.url : "/notifications",
      personId: typeof body.personId === "string" ? body.personId : null,
      organizationId: typeof body.organizationId === "string" ? body.organizationId : null,
      phone,
      email: typeof body.email === "string" ? body.email : null,
      correlationId: typeof body.correlationId === "string" ? body.correlationId : null,
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Notification routing test failed" },
      { status: 500 }
    );
  }
}
