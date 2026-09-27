import { getDb } from "@/lib/db";
import { lookupHash } from "@/lib/data-security";
import { enforceMobileMessageIntent } from "@/lib/messaging-policy";
import { mobileSendDecision } from "@/lib/sms-consent-policy";
import { decideOrgMobileCap, ORG_TEXTING_LIMIT_ERROR, utcMonthWindow } from "@/lib/org-messaging-cap-policy";
import { evaluateOrgMessagingAlerts, orgMobileCapCents, recordOrgCapBlocked } from "@/lib/org-messaging-limits";
import { SANDBOX_SKIPPED_STATUS, sandboxDeliveryDecision } from "@/lib/messaging-sandbox-policy";

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

export class OrgTextingLimitError extends Error {
  constructor() {
    super(ORG_TEXTING_LIMIT_ERROR);
    this.name = "OrgTextingLimitError";
  }
}

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

    // Fail closed: if the number cannot be hashed (no key configured) this throws
    // and nothing is sent, rather than silently skipping the consent check.
    const hash = lookupHash(input.to);
    const consent = await client.query(
      `select
         (select messaging_consent_status from phones
           where lookup_hash=$1 and verified_at is not null
           order by created_at desc limit 1) as phone_state,
         (select state from sms_opt_outs where lookup_hash=$1) as registry_state`,
      [hash]
    );
    const decision = mobileSendDecision({
      notificationType: input.notificationType,
      phoneState: consent.rows[0]?.phone_state ?? null,
      registryState: consent.rows[0]?.registry_state ?? null,
    });
    if (!decision.allowed) throw new Error(decision.reason);

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

    // Per-organization fair-use cap. Checked in the same transaction as the
    // reservation, under a per-organization advisory lock, so parallel sends
    // for one organization cannot all observe the same pre-send total.
    // Critical urgency and OTP are always allowed but still counted.
    let orgCapChecked = false;
    if (input.organizationId) {
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [`bandwagon:org-mobile:${input.organizationId}`]);
      const month = utcMonthWindow();
      const capCents = await orgMobileCapCents(client, input.organizationId);
      const usage = await client.query(
        `select coalesce(sum(estimated_cost_cents),0)::numeric as used from notification_deliveries
          where organization_id=$1 and channel in ('sms','rcs') and status not in ('failed','blocked_org_cap')
            and created_at>=$2 and created_at<$3`,
        [input.organizationId, month.start, month.end]
      );
      const decision = decideOrgMobileCap({
        organizationId: input.organizationId,
        urgency: input.urgency,
        notificationType: input.notificationType,
        usedCents: Number(usage.rows[0]?.used || 0),
        requestedCents: input.estimatedCostCents,
        capCents,
      });
      if (!decision.allowed) throw new OrgTextingLimitError();
      orgCapChecked = true;
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
    if (orgCapChecked && input.organizationId) {
      // Threshold alerts are deduplicated per organization, month, and threshold.
      void evaluateOrgMessagingAlerts(input.organizationId).catch(() => undefined);
    }
    return reserved.rows[0].id as number | string;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error instanceof OrgTextingLimitError && input.organizationId) {
      await recordOrgCapBlocked(input.db, {
        organizationId: input.organizationId,
        personId: input.personId || null,
        notificationType: input.notificationType,
        channel: input.channel,
        urgency: input.urgency,
        correlationId: input.correlationId || null,
      }).catch(() => undefined);
      void evaluateOrgMessagingAlerts(input.organizationId).catch(() => undefined);
    }
    throw error;
  } finally {
    client.release();
  }
}

async function recordSandboxSkip(input: {
  to: string;
  personId?: string | null;
  organizationId?: string | null;
  notificationType: string;
  urgency: "routine" | "important" | "critical";
  correlationId?: string | null;
  mode: TwilioDeliveryMode;
  segments: number;
  reason: string;
}) {
  const db = getDb();
  if (!db) return;
  await db
    .query(
      `insert into notification_deliveries
        (person_id, organization_id, notification_type, channel, destination_ref,
         status, estimated_cost_cents, metadata, urgency, correlation_id)
       select $1,$2,$3,$4,$5,$6,0,$7::jsonb,$8,$9`,
      [
        input.personId || null,
        input.organizationId || null,
        input.notificationType,
        input.mode === "sms" ? "sms" : "rcs",
        input.to,
        SANDBOX_SKIPPED_STATUS,
        JSON.stringify({ sandbox: true, reason: input.reason, requestedMode: input.mode, segments: input.segments }),
        input.urgency,
        input.correlationId || null,
      ]
    )
    .catch((error) => {
      console.error("Unable to record sandbox-skipped message", {
        error: error instanceof Error ? error.message : "Database insert failed",
      });
    });
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

  const to = normalizePhone(input.to);
  if (!to) throw new Error("Recipient must be a valid E.164 phone number");

  const { body } = enforceMobileMessageIntent(input);

  const mode = input.mode || "auto";

  // Staging and test environments: only allowlisted phones reach Twilio.
  // Checked before the credential check so a sandbox never needs live creds.
  const sandbox = sandboxDeliveryDecision({ channel: "sms", to, env: process.env });
  if (!sandbox.send) {
    await recordSandboxSkip({ ...input, to, mode, segments: estimatedSegments(body), reason: sandbox.reason });
    return {
      ok: false,
      skipped: true,
      reason: sandbox.reason,
      sid: null as string | null,
      status: SANDBOX_SKIPPED_STATUS,
      requestedMode: mode,
      estimatedCostCents: 0,
      segments: estimatedSegments(body),
    };
  }

  if (!accountSid || !authToken || !messagingServiceSid) {
    throw new Error("Twilio production configuration is incomplete");
  }
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
    skipped: false,
    reason: null as string | null,
    sid: twilio.sid as string | null,
    status: twilio.status as string,
    requestedMode: mode,
    estimatedCostCents,
    segments,
  };
}
