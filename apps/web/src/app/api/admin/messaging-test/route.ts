import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function secureEqual(a: string, b: string) {
  const aa = Buffer.from(a || "");
  const bb = Buffer.from(b || "");
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function normalizePhone(value: unknown) {
  const phone = String(value || "").trim();
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

export async function POST(request: Request) {
  const configuredToken = process.env.ADMIN_TEST_TOKEN;
  if (!configuredToken) {
    return Response.json(
      { error: "ADMIN_TEST_TOKEN is not configured on the server." },
      { status: 503 }
    );
  }

  const suppliedToken = request.headers.get("x-bandwagon-admin-token") || "";
  if (!secureEqual(suppliedToken, configuredToken)) {
    return Response.json({ error: "Invalid admin test token." }, { status: 401 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !messagingServiceSid) {
    return Response.json(
      { error: "Twilio production configuration is incomplete." },
      { status: 503 }
    );
  }

  let payload: { to?: string; body?: string; mode?: string };
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

  if (allowedPhone && to !== allowedPhone) {
    return Response.json(
      { error: "This test tool is restricted to ADMIN_TEST_PHONE." },
      { status: 403 }
    );
  }

  const body = String(payload.body || "").trim();
  if (!body || body.length > 1000) {
    return Response.json(
      { error: "Message body must be between 1 and 1000 characters." },
      { status: 400 }
    );
  }

  const mode = payload.mode === "sms" ? "sms" : "auto";
  if (mode === "sms" && !phoneNumber) {
    return Response.json(
      { error: "TWILIO_PHONE_NUMBER is required to force SMS." },
      { status: 503 }
    );
  }

  const form = new URLSearchParams();
  form.set("To", to);
  form.set("Body", body);
  form.set("MessagingServiceSid", messagingServiceSid);

  // Auto mode lets Messaging Service sender selection choose RCS first and
  // automatically fall back to an SMS/MMS sender when required.
  // SMS mode pins the From sender to the configured BandWagon number.
  if (mode === "sms" && phoneNumber) {
    form.set("From", phoneNumber);
  }

  const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
  if (appUrl) {
    form.set("StatusCallback", `${appUrl}/api/webhooks/twilio/status`);
  }

  const endpoint =
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization:
        "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
    cache: "no-store",
  });

  const raw = await response.text();
  let twilio: any = {};
  try {
    twilio = JSON.parse(raw);
  } catch {
    twilio = { message: raw };
  }

  if (!response.ok) {
    console.warn("BandWagon messaging test rejected by Twilio", {
      status: response.status,
      code: twilio.code || null,
      message: twilio.message || null,
    });

    return Response.json(
      {
        error: twilio.message || "Twilio rejected the test message.",
        twilioCode: twilio.code || null,
      },
      { status: response.status }
    );
  }

  console.info("BandWagon messaging platform test accepted", {
    sid: twilio.sid,
    status: twilio.status,
    requestedMode: mode,
    to,
  });

  return Response.json({
    ok: true,
    sid: twilio.sid,
    status: twilio.status,
    to: twilio.to || to,
    from: twilio.from || null,
    requestedMode:
      mode === "auto" ? "RCS preferred + SMS fallback" : "Forced SMS",
    note:
      mode === "auto"
        ? "Twilio Messaging Service sender selection determines whether this is delivered over RCS or falls back to SMS."
        : "The configured BandWagon phone number was explicitly selected as the sender.",
  });
}
