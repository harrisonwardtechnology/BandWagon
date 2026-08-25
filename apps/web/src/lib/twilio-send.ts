import { getDb } from "@/lib/db";
import { lookupHash } from "@/lib/data-security";
import { enforceMobileMessageIntent } from "@/lib/messaging-policy";

export type TwilioDeliveryMode = "auto" | "sms";

function normalizePhone(value: string | null | undefined) {
  const phone = String(value || "").trim();
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

function estimatedSegments(body: string) {
  // Conservative planning estimate. Unicode can lower the per-segment limit.
  return Math.max(1, Math.ceil(body.length / 153));
}

export async function sendTwilioNotification(input: {
  to: string;
  body: string;
  mode?: TwilioDeliveryMode;
  personId?: string | null;
  organizationId?: string | null;
  notificationType: string;
  urgency: "routine" | "important" | "critical";
  correlationId?: string | null;
}) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !messagingServiceSid) {
    throw new Error("Twilio production configuration is incomplete");
  }

  const to = normalizePhone(input.to);
  if (!to) throw new Error("Recipient must be a valid E.164 phone number");

  const { body } = enforceMobileMessageIntent(input);

  const mode = input.mode || "auto";
  if (mode === "sms" && !phoneNumber) {
    throw new Error("TWILIO_PHONE_NUMBER is required to force SMS");
  }

  const db = getDb();
  if (db) {
    if (process.env.LOOKUP_HASH_KEY) {
      const consent=await db.query(`select messaging_consent_status from phones where lookup_hash=$1 and verified_at is not null order by created_at desc limit 1`,[lookupHash(to)]);
      if (consent.rows[0]?.messaging_consent_status==="opted_out") throw new Error("Recipient has opted out of mobile messaging");
    }
    const windowMinutes=input.notificationType==="otp"?15:60;
    const limit=input.notificationType==="otp"?5:20;
    const recent=await db.query(`select count(*)::int as count from notification_deliveries where destination_ref=$1 and channel in ('sms','rcs') and created_at>now()-($2||' minutes')::interval`,[to,String(windowMinutes)]);
    if(Number(recent.rows[0]?.count||0)>=limit)throw new Error("Mobile messaging rate limit reached for this recipient");
  }

  if(input.notificationType==="platform_test"&&process.env.NODE_ENV==="production"){
    const allowed=normalizePhone(process.env.ADMIN_TEST_PHONE);
    if(!allowed||to!==allowed)throw new Error("Production platform tests are restricted to ADMIN_TEST_PHONE");
  }

  const form = new URLSearchParams();
  form.set("To", to);
  form.set("Body", body);
  form.set("MessagingServiceSid", messagingServiceSid);
  if (mode === "sms" && phoneNumber) form.set("From", phoneNumber);

  const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
  if (appUrl) form.set("StatusCallback", `${appUrl}/api/webhooks/twilio/status`);

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
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

  const channel = mode === "sms" ? "sms" : "rcs";
  const segments = estimatedSegments(body);
  // Planning estimate only: roughly 1.25 cents/segment including blended carrier fees.
  const estimatedCostCents = segments * 1.25;

  if (db) {
    await db.query(
      `insert into notification_deliveries
        (person_id, organization_id, notification_type, channel, destination_ref,
         provider_message_id, status, estimated_cost_cents, metadata, urgency, correlation_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)`,
      [
        input.personId || null,
        input.organizationId || null,
        input.notificationType,
        channel,
        to,
        twilio.sid || null,
        response.ok ? twilio.status || "accepted" : "failed",
        estimatedCostCents,
        JSON.stringify({ requestedMode: mode, segments, twilioCode: twilio.code || null }),
        input.urgency,
        input.correlationId || null,
      ]
    );
  }

  if (!response.ok) {
    throw new Error(twilio.message || "Twilio rejected the notification");
  }

  return {
    ok: true,
    sid: twilio.sid as string,
    status: twilio.status as string,
    requestedMode: mode,
    estimatedCostCents,
    segments,
  };
}
