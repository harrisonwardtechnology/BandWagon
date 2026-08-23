import crypto from "node:crypto";
import { getDb } from "@/lib/db";
import { sendPushToSubscription, type PushPayload } from "@/lib/push";
import { sendTwilioNotification } from "@/lib/twilio-send";
import { sendEmailNotification } from "@/lib/email-send";

export type NotificationUrgency = "routine" | "important" | "critical";
export type NotificationType =
  | "new_ride_available"
  | "driver_offer"
  | "ride_matched"
  | "reminder_24h"
  | "reminder_1h"
  | "driver_arriving"
  | "last_minute_cancellation"
  | "pickup_changed"
  | "otp"
  | "platform_test"
  | string;

export type NotificationRequest = {
  notificationType: NotificationType;
  title: string;
  body: string;
  url?: string;
  personId?: string | null;
  organizationId?: string | null;
  phone?: string | null;
  email?: string | null;
  correlationId?: string | null;
  forceUrgency?: NotificationUrgency;
};

type Policy = {
  urgency: NotificationUrgency;
  push: boolean;
  emailFallback: boolean;
  smsFallback: boolean;
  smsImmediate: boolean;
  smsOnly?: boolean;
};

const POLICIES: Record<string, Policy> = {
  new_ride_available: { urgency: "routine", push: true, emailFallback: true, smsFallback: false, smsImmediate: false },
  driver_offer: { urgency: "routine", push: true, emailFallback: true, smsFallback: false, smsImmediate: false },
  ride_matched: { urgency: "important", push: true, emailFallback: true, smsFallback: true, smsImmediate: false },
  reminder_24h: { urgency: "routine", push: true, emailFallback: true, smsFallback: false, smsImmediate: false },
  reminder_1h: { urgency: "important", push: true, emailFallback: false, smsFallback: true, smsImmediate: false },
  driver_arriving: { urgency: "critical", push: true, emailFallback: false, smsFallback: false, smsImmediate: true },
  last_minute_cancellation: { urgency: "critical", push: true, emailFallback: true, smsFallback: false, smsImmediate: true },
  pickup_changed: { urgency: "critical", push: true, emailFallback: false, smsFallback: false, smsImmediate: true },
  otp: { urgency: "critical", push: false, emailFallback: false, smsFallback: false, smsImmediate: true, smsOnly: true },
  platform_test: { urgency: "important", push: true, emailFallback: false, smsFallback: true, smsImmediate: false },
};

const DEFAULT_POLICY: Policy = {
  urgency: "routine",
  push: true,
  emailFallback: true,
  smsFallback: false,
  smsImmediate: false,
};

function policyFor(type: string, forced?: NotificationUrgency): Policy {
  const base = POLICIES[type] || DEFAULT_POLICY;
  return forced ? { ...base, urgency: forced } : base;
}

async function recipientContext(request: NotificationRequest) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");

  const preferences = {
    push_enabled: true,
    email_enabled: true,
    sms_enabled: true,
    sms_for_critical_only: true,
    reminder_push_enabled: true,
    reminder_email_enabled: false,
    reminder_sms_enabled: false,
  };

  if (request.personId) {
    const pref = await db.query(
      `select push_enabled,email_enabled,sms_enabled,sms_for_critical_only,
              reminder_push_enabled,reminder_email_enabled,reminder_sms_enabled
       from notification_preferences
       where person_id=$1 and organization_id is not distinct from $2
       limit 1`,
      [request.personId, request.organizationId || null]
    );
    if (pref.rows[0]) Object.assign(preferences, pref.rows[0]);
  }

  let email = request.email || null;
  if (!email && request.personId) {
    const result = await db.query(
      `select normalized_email from emails
       where person_id=$1 and verified_at is not null
       order by verified_at desc limit 1`,
      [request.personId]
    );
    email = result.rows[0]?.normalized_email || null;
  }

  const params: unknown[] = [];
  let where = "where status='active'";
  if (request.personId) {
    params.push(request.personId);
    where += ` and person_id=$${params.length}`;
  } else if (request.organizationId) {
    params.push(request.organizationId);
    where += ` and organization_id=$${params.length}`;
  }

  const subscriptions = await db.query(
    `select endpoint,p256dh,auth,person_id,organization_id
     from push_subscriptions ${where}
     order by last_seen_at desc limit 20`,
    params
  );

  return { preferences, email, subscriptions: subscriptions.rows };
}

function shouldUseReminderPreference(type: string) {
  return type === "reminder_24h" || type === "reminder_1h";
}

export async function routeNotification(request: NotificationRequest) {
  const policy = policyFor(request.notificationType, request.forceUrgency);
  const correlationId = request.correlationId || crypto.randomUUID();
  const context = await recipientContext(request);
  const prefs = context.preferences;
  const reminder = shouldUseReminderPreference(request.notificationType);

  const pushAllowed = policy.push && prefs.push_enabled && (!reminder || prefs.reminder_push_enabled);
  const emailAllowed = prefs.email_enabled && (!reminder || prefs.reminder_email_enabled);
  const smsAllowed =
    prefs.sms_enabled &&
    (!prefs.sms_for_critical_only || policy.urgency === "critical") &&
    (!reminder || prefs.reminder_sms_enabled || policy.urgency === "critical");

  const result: any = {
    correlationId,
    notificationType: request.notificationType,
    urgency: policy.urgency,
    plan: {
      pushAllowed,
      emailAllowed,
      smsAllowed,
      smsImmediate: policy.smsImmediate,
      smsFallback: policy.smsFallback,
    },
    push: { attempted: 0, accepted: 0, failed: 0 },
    email: { attempted: false, accepted: false, skipped: false },
    messaging: { attempted: false, accepted: false },
  };

  const pushPayload: PushPayload = {
    title: request.title,
    body: request.body,
    url: request.url || "/",
    tag: `bandwagon-${request.notificationType}`,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { correlationId, notificationType: request.notificationType },
  };

  if (pushAllowed && !policy.smsOnly) {
    for (const subscription of context.subscriptions) {
      result.push.attempted++;
      const outcome = await sendPushToSubscription(subscription, pushPayload, {
        notificationType: request.notificationType,
        urgency: policy.urgency,
        correlationId,
      });
      if (outcome.ok) result.push.accepted++;
      else result.push.failed++;
    }
  }

  const pushAvailable = result.push.accepted > 0;
  const sendSmsNow = policy.smsImmediate || (policy.smsFallback && !pushAvailable);

  if (sendSmsNow && smsAllowed && request.phone) {
    result.messaging.attempted = true;
    try {
      const outcome = await sendTwilioNotification({
        to: request.phone,
        body: request.body,
        mode: "auto",
        personId: request.personId,
        organizationId: request.organizationId,
        notificationType: request.notificationType,
        urgency: policy.urgency,
        correlationId,
      });
      result.messaging.accepted = outcome.ok;
      result.messaging.sid = outcome.sid;
      result.messaging.estimatedCostCents = outcome.estimatedCostCents;
    } catch (error) {
      result.messaging.error = error instanceof Error ? error.message : "Messaging failed";
    }
  } else if (sendSmsNow && !request.phone) {
    result.messaging.skipped = "No phone supplied";
  } else if (sendSmsNow && !smsAllowed) {
    result.messaging.skipped = "SMS/RCS disabled by notification preferences";
  }

  const shouldEmail =
    policy.emailFallback &&
    emailAllowed &&
    Boolean(context.email) &&
    (!pushAvailable || policy.urgency === "critical");

  if (shouldEmail && context.email) {
    result.email.attempted = true;
    const emailOutcome = await sendEmailNotification({
      to: context.email,
      subject: request.title,
      body: request.body,
      personId: request.personId,
      organizationId: request.organizationId,
      notificationType: request.notificationType,
      urgency: policy.urgency,
      correlationId,
    });
    result.email.accepted = Boolean(emailOutcome.ok);
    result.email.skipped = Boolean(emailOutcome.skipped);
    if (!emailOutcome.ok) result.email.reason = emailOutcome.reason;
  }

  return result;
}

export function notificationPolicySummary() {
  return Object.entries(POLICIES).map(([type, policy]) => ({ type, ...policy }));
}
