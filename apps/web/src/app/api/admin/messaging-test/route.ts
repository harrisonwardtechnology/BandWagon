import { requirePlatformRole } from "@/lib/auth";
import { sendTwilioNotification } from "@/lib/twilio-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizePhone(value: unknown) {
  const phone = String(value || "").trim();
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

export async function POST(request: Request) {
  try { await requirePlatformRole(["owner"]); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Platform owner access is required" }, { status: 403 }); }

  let payload: { to?: string; mode?: string };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request." }, { status: 400 });
  }

  const to = normalizePhone(payload.to);
  if (!to) {
    return Response.json(
      { error: "Recipient must be a valid E.164 phone number." },
      { status: 400 }
    );
  }

  const allowedPhone = process.env.ADMIN_TEST_PHONE
    ? normalizePhone(process.env.ADMIN_TEST_PHONE)
    : null;

  if (process.env.NODE_ENV === "production" && !allowedPhone) {
    return Response.json({ error: "ADMIN_TEST_PHONE is required for production messaging tests." }, { status: 503 });
  }
  if (allowedPhone && to !== allowedPhone) {
    return Response.json(
      { error: "This test tool is restricted to ADMIN_TEST_PHONE." },
      { status: 403 }
    );
  }

  const mode = payload.mode === "sms" ? "sms" : "auto";
  try {
    const result=await sendTwilioNotification({to,body:"BandWagon platform test: Transactional messaging is working. Reply HELP for help or STOP to opt out.",mode,notificationType:"platform_test",urgency:"important"});
    return Response.json({...result,to,requestedMode:mode==="auto"?"RCS preferred + SMS fallback":"Forced SMS",note:"This endpoint uses a fixed transactional test template and cannot relay free-form messages."});
  } catch(error) {
    return Response.json({error:error instanceof Error?error.message:"Twilio rejected the test message."},{status:500});
  }
}
