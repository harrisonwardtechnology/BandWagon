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

type DbPool = NonNullable<ReturnType<typeof getDb>>;

async function reserveMobileDelivery(input: {
  db: DbPool;
  to: string;
  personId?: string | null;
  organizationId?: string | null;
  notificationType: string;
  channel: "sms" | "rcs";
  urgency: "routine" | "important" | "critical";
  correlationId?: string | null;
  estimatedCostCents: number;
  mode: TwilioDeliveryMode;
  segments: number;
}) {
  const client = await input.db.connect();
  try {
    await client.query("BEGIN");
    // The lock and reservation are in one transaction. Parallel requests for
    // the same destination cannot all observe the same pre-send count.
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`bandwagon:mobile:${input.to}`]);

    if (process.env.LOOKUP_HASH_KEY) {
      const consent = await client.query(
        `select messaging_consent_status from phones
          where lookup_hash=$1 and verified_at is not null
          order by created_at desc limit 1`,
        [lookupHash(input.to)]
      );
      if (consent.rows[0]?.messaging_consent_status === "opted_out") {
        throw new Error("Recipient has opted out of mobile messaging");
      }
    }

    const windowMinutes = input.notificationType === "otp" ? 15 : 60;
    const limit = input.notificationType === "otp" ? 5 : 20;
    const recent = await client.query(
      `select count(*)::int as count from notification_deliveries
        where destination_ref=$1 and channel in ('sms','rcs')
          and created_at>now()-($2||' minutes')::interval`,
      [input.to, String(windowMinutes)]
    );
    if (Number(recent.rows[0]?.count || 0) >= limit) {
      throw new Error("Mobile messaging rate limit reached for this recipient");
    }

    const reserved = await client.query(
      `insert into notification_deliveries
        (person_id, organization_id, notification_type, channel, destination_ref,
         status, estimated_cost_cents, metadata, urgency, correlation_id)
       values ($1,$2,$3,$4,$5,'reserved',$6,$7::jsonb,$8,$9)
       returning id`,
      [
        input.personId || null,
        input.organizationId || null,
        input.notificationType,
        input.channel,
        input.to,
        input.estimatedCostCents,
        JSON.stringify({ requestedMode: input.mode, segments: input.segments }),
        input.urgency,
        input.correlationId || null,
      ]
    );
    await client.query("COMMIT");
    return reserved.rows[0].id as number | string;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
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

  const db = getDb();
  if (!db && process.env.NODE_ENV === "production") {
    throw new Error("Database is required to enforce production mobile messaging controls");
  }

  const channel = mode === "sms" ? "sms" : "rcs";
  const segments = estimatedSegments(body);
  // Planning estimate only: roughly 1.25 cents/segment including blended carrier fees.
  const estimatedCostCents = segments * 1.25;
  const deliveryId = db
    ? await reserveMobileDelivery({
        db,
        to,
        personId: input.personId,
        organizationId: input.organizationId,
        notificationType: input.notificationType,
        channel,
        urgency: input.urgency,
        correlationId: input.correlationId,
        estimatedCostCents,
        mode,
        segments,
      })
    : null;

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      cache: "no-store",
    });
  } catch (error) {
    if (db && deliveryId != null) {
      await db.query(
        `update notification_deliveries
          set status='failed',failed_at=now(),metadata=metadata||$1::jsonb
          where id=$2`,
        [JSON.stringify({ transportError: true }), deliveryId]
      ).catch(() => undefined);
    }
    throw error;
  }

  let raw: string;
  try {
    raw = await response.text();
  } catch (error) {
    if (db && deliveryId != null) {
      await db.query(
        `update notification_deliveries
          set status='failed',failed_at=now(),metadata=metadata||$1::jsonb
          where id=$2`,
        [JSON.stringify({ responseBodyError: true }), deliveryId]
      ).catch(() => undefined);
    }
    throw error;
  }
  let twilio: any = {};
  try {
    twilio = JSON.parse(raw);
  } catch {
    twilio = { message: raw };
  }

  if (db && deliveryId != null) {
    await db.query(
      `update notification_deliveries
        set provider_message_id=$1,status=$2,
            metadata=metadata||$3::jsonb,
            failed_at=case when $4::boolean then null else now() end
        where id=$5`,
      [
        twilio.sid || null,
        response.ok ? twilio.status || "accepted" : "failed",
        JSON.stringify({ twilioCode: twilio.code || null }),
        response.ok,
        deliveryId,
      ]
    ).catch((error) => {
      // The carrier may already have accepted the message. Do not turn an
      // audit-write failure into a caller retry and duplicate notification.
      console.error("Unable to finalize Twilio delivery audit", {
        deliveryId,
        providerMessageId: twilio.sid || null,
        error: error instanceof Error ? error.message : "Database update failed",
      });
    });
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
