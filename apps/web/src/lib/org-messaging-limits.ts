import { getDb } from "@/lib/db";
import { sendEmailNotification } from "@/lib/email-send";
import type { SessionIdentity } from "@/lib/auth";
import {
  defaultOrgMonthlySmsCapCents,
  effectiveOrgCapCents,
  MAX_ORG_MONTHLY_SMS_CAP_CENTS,
  normalizeAlertThresholdPercent,
  reachedAlertThresholds,
  usagePercent,
  utcMonthWindow,
} from "@/lib/org-messaging-cap-policy";

type Queryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> };

function dbRequired() {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

export function platformDefaultCapCents() {
  return defaultOrgMonthlySmsCapCents(process.env.ORG_DEFAULT_MONTHLY_SMS_CAP_CENTS);
}

/** Effective monthly cap for an organization (org override, else platform default). */
export async function orgMobileCapCents(client: Queryable, organizationId: string) {
  const row = (await client.query(`select monthly_cost_cap_cents from organization_messaging_limits where organization_id=$1`, [organizationId])).rows[0];
  return effectiveOrgCapCents(row?.monthly_cost_cap_cents, platformDefaultCapCents());
}

/** A blocked send is recorded without a destination so it never counts toward per-recipient limits. */
export async function recordOrgCapBlocked(db: Queryable, input: { organizationId: string; personId: string | null; notificationType: string; channel: "sms" | "rcs"; urgency: string; correlationId: string | null }) {
  await db.query(
    `insert into notification_deliveries
      (person_id, organization_id, notification_type, channel, destination_ref, status, estimated_cost_cents, metadata, urgency, correlation_id, failed_at)
     values ($1,$2,$3,$4,null,'blocked_org_cap',0,$5::jsonb,$6,$7,now())`,
    [input.personId, input.organizationId, input.notificationType, input.channel, JSON.stringify({ blockedBy: "organization_monthly_texting_limit" }), input.urgency, input.correlationId]
  );
}

async function monthlyMobileUsage(client: Queryable, organizationId: string, now = new Date()) {
  const month = utcMonthWindow(now);
  const row = (
    await client.query(
      `select coalesce(sum(estimated_cost_cents) filter (where status not in ('failed','blocked_org_cap')),0)::numeric as used,
              count(*) filter (where status not in ('failed','blocked_org_cap'))::int as sent,
              count(*) filter (where status='blocked_org_cap')::int as blocked,
              count(*) filter (where status not in ('failed','blocked_org_cap') and (urgency='critical' or notification_type='otp'))::int as protected_sent
         from notification_deliveries
        where organization_id=$1 and channel in ('sms','rcs') and created_at>=$2 and created_at<$3`,
      [organizationId, month.start, month.end]
    )
  ).rows[0];
  return { month, usedCents: Number(row?.used || 0), sent: Number(row?.sent || 0), blocked: Number(row?.blocked || 0), protectedSent: Number(row?.protected_sent || 0) };
}

async function alertRecipients(organizationId: string) {
  const db = dbRequired();
  const rows = (
    await db.query(
      `select distinct e.normalized_email as email
         from memberships m
         join emails e on e.person_id=m.person_id and e.verified_at is not null
        where m.organization_id=$1 and m.group_id is null and m.status='active' and m.role in ('owner','admin')
       union
       select distinct e.normalized_email
         from user_accounts ua
         join emails e on e.person_id=ua.person_id and e.verified_at is not null
        where ua.platform_role='owner' and ua.status='active'`,
      [organizationId]
    )
  ).rows;
  return rows.map((row) => String(row.email)).filter(Boolean).slice(0, 25);
}

/** Sends at most one alert per organization, month, and threshold (alert percent and 100%). */
export async function evaluateOrgMessagingAlerts(organizationId: string) {
  const db = dbRequired();
  const settings = (await db.query(`select alert_threshold_percent from organization_messaging_limits where organization_id=$1`, [organizationId])).rows[0];
  const capCents = await orgMobileCapCents(db, organizationId);
  const usage = await monthlyMobileUsage(db, organizationId);
  const thresholds = reachedAlertThresholds({ usedCents: usage.usedCents, capCents, alertThresholdPercent: settings?.alert_threshold_percent });
  const sent: number[] = [];
  for (const threshold of thresholds) {
    const claimed = await db.query(
      `insert into organization_messaging_alerts(organization_id,usage_month,threshold_percent,observed_cost_cents,cap_cents,status,last_attempt_at)
       values($1,$2,$3,$4,$5,'pending',now())
       on conflict(organization_id,usage_month,threshold_percent) do update
         set observed_cost_cents=excluded.observed_cost_cents,cap_cents=excluded.cap_cents,status='pending',error_message=null,last_attempt_at=now()
         where organization_messaging_alerts.status in ('failed','pending') and organization_messaging_alerts.last_attempt_at<now()-interval '1 hour'
       returning id`,
      [organizationId, usage.month.monthKey, threshold, usage.usedCents, capCents]
    );
    if (!claimed.rowCount) continue;
    const alertId = claimed.rows[0].id;
    const org = (await db.query(`select coalesce(display_name,name) as name from organizations where id=$1`, [organizationId])).rows[0];
    const name = org?.name || "Your organization";
    const recipients = await alertRecipients(organizationId);
    let failure: string | null = recipients.length ? null : "No verified admin or platform owner email is available";
    const reached = threshold >= 100;
    const subject = reached ? `BandWagon: ${name} reached its monthly texting limit` : `BandWagon: ${name} has used ${threshold}% of its monthly texting limit`;
    const body = [
      `${name} has used $${(usage.usedCents / 100).toFixed(2)} of its $${(capCents / 100).toFixed(2)} monthly texting allowance (${usagePercent(usage.usedCents, capCents)}%).`,
      "",
      reached
        ? "Routine and important text messages are paused until next month. Push notifications and email still work. Safety alerts, driver arriving messages, cancellations, and sign-in codes are always sent."
        : "Nothing is paused yet. When the limit is reached, routine and important texts pause until next month, while safety alerts, driver arriving messages, cancellations, and sign-in codes are always sent.",
      "",
      "Organization admins can see usage on the BandWagon Usage page. Contact BandWagon Support if your organization needs a higher limit.",
    ].join("\n");
    for (const to of recipients) {
      const result = await sendEmailNotification({ to, subject, body, organizationId, notificationType: "org_texting_limit_alert", urgency: reached ? "important" : "routine" }).catch((error) => ({ ok: false, reason: error instanceof Error ? error.message : "Email failed" }));
      if (!result.ok) failure = (result as { reason?: string }).reason || "Email failed";
    }
    await db.query(
      `update organization_messaging_alerts set status=$1,error_message=$2,recipient_count=$3,sent_at=case when $1='sent' then now() else sent_at end where id=$4`,
      [failure ? "failed" : "sent", failure, recipients.length, alertId]
    );
    await db.query(
      `insert into audit_events(organization_id,action,target_type,target_id,outcome,metadata) values($1,'org_texting_limit_alert','organization',$2,$3,$4::jsonb)`,
      [organizationId, organizationId, failure ? "failure" : "success", JSON.stringify({ thresholdPercent: threshold, usageMonth: usage.month.monthKey, usedCents: usage.usedCents, capCents, recipientCount: recipients.length })]
    ).catch(() => undefined);
    if (!failure) sent.push(threshold);
  }
  return { thresholds, sent };
}

async function aiUsageForOrganization(organizationId: string, month: { start: Date; end: Date }) {
  // Read-only view of the existing AI governance data (migrations 028 and 052).
  // AI caps are enforced by ai-governance.ts; this page does not duplicate them.
  const db = dbRequired();
  const [settings, jobs] = await Promise.all([
    db.query(`select ai_enabled,monthly_budget_cents from organization_ai_settings where organization_id=$1`, [organizationId]),
    db.query(
      `select coalesce(sum(case when status='processing' then reserved_cost_microusd else estimated_cost_microusd end),0)::bigint as used,
              count(*) filter (where status in ('processing','completed'))::int as jobs
         from ai_jobs where organization_id=$1 and created_at>=$2 and created_at<$3 and status in ('processing','completed')`,
      [organizationId, month.start, month.end]
    ),
  ]);
  const s = settings.rows[0];
  const usedCents = Math.round(Number(jobs.rows[0]?.used || 0) / 10_000);
  const budgetCents = s?.monthly_budget_cents == null ? null : Number(s.monthly_budget_cents);
  return { enabled: Boolean(s?.ai_enabled), budgetCents, usedCents, jobs: Number(jobs.rows[0]?.jobs || 0), percent: budgetCents ? usagePercent(usedCents, budgetCents) : 0 };
}

export async function getOrgUsage(organizationId: string) {
  const db = dbRequired();
  const [org, limits] = await Promise.all([
    db.query(`select id,coalesce(display_name,name) as name,slug from organizations where id=$1`, [organizationId]),
    db.query(`select monthly_cost_cap_cents,alert_threshold_percent,notes,updated_at from organization_messaging_limits where organization_id=$1`, [organizationId]),
  ]);
  if (!org.rowCount) throw new Error("Organization not found");
  const limit = limits.rows[0] || null;
  const defaultCents = platformDefaultCapCents();
  const capCents = effectiveOrgCapCents(limit?.monthly_cost_cap_cents, defaultCents);
  const usage = await monthlyMobileUsage(db, organizationId);
  const [ai, alerts] = await Promise.all([
    aiUsageForOrganization(organizationId, usage.month),
    db.query(`select threshold_percent,status,sent_at from organization_messaging_alerts where organization_id=$1 and usage_month=$2 order by threshold_percent`, [organizationId, usage.month.monthKey]),
  ]);
  return {
    organization: org.rows[0],
    month: usage.month.monthKey,
    texting: {
      capCents,
      usesPlatformDefault: limit?.monthly_cost_cap_cents == null,
      platformDefaultCents: defaultCents,
      alertThresholdPercent: normalizeAlertThresholdPercent(limit?.alert_threshold_percent ?? 80),
      usedCents: Math.round(usage.usedCents * 100) / 100,
      percent: usagePercent(usage.usedCents, capCents),
      messagesSent: usage.sent,
      protectedMessagesSent: usage.protectedSent,
      messagesPaused: usage.blocked,
      limitReached: usage.usedCents >= capCents,
      notes: limit?.notes || null,
      updatedAt: limit?.updated_at || null,
    },
    ai,
    alerts: alerts.rows,
  };
}

/** Platform overview: every active organization's texting usage against its cap this month. */
export async function listOrgTextingUsage() {
  const db = dbRequired();
  const month = utcMonthWindow();
  const defaultCents = platformDefaultCapCents();
  const rows = (
    await db.query(
      `select o.id,coalesce(o.display_name,o.name) as name,o.slug,l.monthly_cost_cap_cents,
              coalesce(u.used,0)::numeric as used,coalesce(u.blocked,0)::int as blocked
         from organizations o
         left join organization_messaging_limits l on l.organization_id=o.id
         left join (
           select organization_id,
                  sum(estimated_cost_cents) filter (where status not in ('failed','blocked_org_cap')) as used,
                  count(*) filter (where status='blocked_org_cap') as blocked
             from notification_deliveries
            where channel in ('sms','rcs') and organization_id is not null and created_at>=$1 and created_at<$2
            group by organization_id
         ) u on u.organization_id=o.id
        where o.status='active'
        order by coalesce(u.used,0) desc, name`,
      [month.start, month.end]
    )
  ).rows;
  return {
    month: month.monthKey,
    platformDefaultCents: defaultCents,
    organizations: rows.map((row) => {
      const capCents = effectiveOrgCapCents(row.monthly_cost_cap_cents, defaultCents);
      const usedCents = Number(row.used || 0);
      return { id: row.id, name: row.name, slug: row.slug, capCents, usesPlatformDefault: row.monthly_cost_cap_cents == null, usedCents: Math.round(usedCents * 100) / 100, percent: usagePercent(usedCents, capCents), messagesPaused: Number(row.blocked || 0) };
    }),
  };
}

/** Platform owner only (enforced by the caller). Null cap means "use the platform default". */
export async function setOrgMessagingLimit(identity: SessionIdentity, input: { organizationId: string; monthlyCostCapCents: number | null; alertThresholdPercent?: number; notes?: string | null }) {
  const db = dbRequired();
  if (!input.organizationId) throw new Error("organizationId is required");
  let cap: number | null = null;
  if (input.monthlyCostCapCents !== null && input.monthlyCostCapCents !== undefined) {
    const parsed = Number(input.monthlyCostCapCents);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_ORG_MONTHLY_SMS_CAP_CENTS) throw new Error("Monthly texting limit must be between $0 and $100,000");
    cap = Math.round(parsed);
  }
  const threshold = normalizeAlertThresholdPercent(input.alertThresholdPercent ?? 80);
  const notes = input.notes ? String(input.notes).trim().slice(0, 1000) || null : null;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const previous = (await client.query(`select monthly_cost_cap_cents,alert_threshold_percent from organization_messaging_limits where organization_id=$1 for update`, [input.organizationId])).rows[0] || null;
    const saved = (
      await client.query(
        `insert into organization_messaging_limits(organization_id,monthly_cost_cap_cents,alert_threshold_percent,notes,updated_by_person_id,updated_at)
         values($1,$2,$3,$4,$5,now())
         on conflict(organization_id) do update set monthly_cost_cap_cents=excluded.monthly_cost_cap_cents,alert_threshold_percent=excluded.alert_threshold_percent,notes=excluded.notes,updated_by_person_id=excluded.updated_by_person_id,updated_at=now()
         returning *`,
        [input.organizationId, cap, threshold, notes, identity.personId]
      )
    ).rows[0];
    await client.query(
      `insert into audit_events(organization_id,actor_person_id,action,target_type,target_id,metadata) values($1,$2,'org_texting_limit_updated','organization',$3,$4::jsonb)`,
      [input.organizationId, identity.personId, input.organizationId, JSON.stringify({ previous, monthlyCostCapCents: cap, alertThresholdPercent: threshold, platformRole: identity.platformRole })]
    );
    await client.query("COMMIT");
    return saved;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
