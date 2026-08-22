import webpush from "web-push";
import { getDb } from "@/lib/db";

function configureVapid() {
  const subject = process.env.VAPID_SUBJECT || "mailto:support@harrisonward.com";
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys are not configured");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
};

export async function savePushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
  deviceLabel?: string | null;
  personId?: string | null;
  organizationId?: string | null;
}) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");

  await db.query(
    `insert into push_subscriptions
      (person_id, organization_id, device_label, endpoint, p256dh, auth, user_agent, status, last_seen_at)
     values ($1,$2,$3,$4,$5,$6,$7,'active',now())
     on conflict (endpoint) do update set
       person_id=coalesce(excluded.person_id,push_subscriptions.person_id),
       organization_id=coalesce(excluded.organization_id,push_subscriptions.organization_id),
       device_label=excluded.device_label,
       p256dh=excluded.p256dh,
       auth=excluded.auth,
       user_agent=excluded.user_agent,
       status='active',
       revoked_at=null,
       last_seen_at=now()`,
    [
      input.personId || null,
      input.organizationId || null,
      input.deviceLabel || null,
      input.endpoint,
      input.p256dh,
      input.auth,
      input.userAgent || null,
    ]
  );
}

export async function revokePushSubscription(endpoint: string) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  await db.query(
    `update push_subscriptions
     set status='revoked', revoked_at=now()
     where endpoint=$1`,
    [endpoint]
  );
}

async function logDelivery(input: {
  organizationId?: string | null;
  personId?: string | null;
  endpoint?: string | null;
  status: string;
  metadata?: Record<string, unknown>;
}) {
  const db = getDb();
  if (!db) return;
  await db.query(
    `insert into notification_deliveries
      (person_id, organization_id, notification_type, channel, destination_ref, status, estimated_cost_cents, metadata)
     values ($1,$2,'platform_test','push',$3,$4,0,$5::jsonb)`,
    [
      input.personId || null,
      input.organizationId || null,
      input.endpoint || null,
      input.status,
      JSON.stringify(input.metadata || {}),
    ]
  );
}

export async function sendPushToSubscription(
  subscription: { endpoint: string; p256dh: string; auth: string; person_id?: string | null; organization_id?: string | null },
  payload: PushPayload
) {
  configureVapid();

  try {
    const result = await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
      {
        TTL: 3600,
        urgency: "normal",
      }
    );

    await logDelivery({
      personId: subscription.person_id,
      organizationId: subscription.organization_id,
      endpoint: subscription.endpoint,
      status: "accepted",
      metadata: { statusCode: result.statusCode },
    });

    return { ok: true, statusCode: result.statusCode };
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || 0);
    const gone = statusCode === 404 || statusCode === 410;

    if (gone) {
      await revokePushSubscription(subscription.endpoint).catch(() => {});
    }

    await logDelivery({
      personId: subscription.person_id,
      organizationId: subscription.organization_id,
      endpoint: subscription.endpoint,
      status: gone ? "revoked" : "failed",
      metadata: { statusCode, message: error?.message || "Push failed" },
    });

    return { ok: false, statusCode, error: error?.message || "Push failed", revoked: gone };
  }
}

export async function sendPushTest(input: {
  organizationId?: string | null;
  endpoint?: string | null;
  payload: PushPayload;
}) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");

  const params: any[] = [];
  let where = "where status='active'";

  if (input.endpoint) {
    params.push(input.endpoint);
    where += ` and endpoint=$${params.length}`;
  } else if (input.organizationId) {
    params.push(input.organizationId);
    where += ` and organization_id=$${params.length}`;
  }

  const result = await db.query(
    `select endpoint,p256dh,auth,person_id,organization_id
     from push_subscriptions ${where}
     order by last_seen_at desc
     limit 100`,
    params
  );

  const outcomes = [];
  for (const row of result.rows) {
    outcomes.push(await sendPushToSubscription(row, input.payload));
  }

  return {
    subscriptions: result.rowCount || 0,
    sent: outcomes.filter((x) => x.ok).length,
    failed: outcomes.filter((x) => !x.ok).length,
    outcomes,
  };
}

export async function pushStatus() {
  const db = getDb();
  if (!db) return { configured: false, database: false };
  const counts = await db.query(
    `select
       count(*) filter (where status='active')::int as active,
       count(*) filter (where status='revoked')::int as revoked
     from push_subscriptions`
  );
  return {
    configured: Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
    activeSubscriptions: Number(counts.rows[0]?.active || 0),
    revokedSubscriptions: Number(counts.rows[0]?.revoked || 0),
  };
}
