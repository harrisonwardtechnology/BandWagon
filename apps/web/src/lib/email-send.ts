import { getDb } from "@/lib/db";

export async function sendEmailNotification(input: {
  to: string;
  subject: string;
  body: string;
  personId?: string | null;
  organizationId?: string | null;
  notificationType: string;
  urgency: "routine" | "important" | "critical";
  correlationId?: string | null;
}) {
  const apiKey = process.env.SMTP2GO_API_KEY;
  const sender = process.env.EMAIL_FROM || process.env.SUPPORT_EMAIL;
  if (!apiKey || !sender) {
    return { ok: false, skipped: true, reason: "SMTP2GO_API_KEY or EMAIL_FROM is not configured" };
  }

  const response = await fetch("https://api.smtp2go.com/v3/email/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      sender,
      to: [input.to],
      subject: input.subject,
      text_body: input.body,
    }),
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));
  const succeeded = response.ok && Number(data?.data?.succeeded || 0) > 0;
  const db = getDb();

  if (db) {
    await db.query(
      `insert into notification_deliveries
        (person_id, organization_id, notification_type, channel, destination_ref,
         provider_message_id, status, estimated_cost_cents, metadata, urgency, correlation_id)
       values ($1,$2,$3,'email',$4,$5,$6,0,$7::jsonb,$8,$9)`,
      [
        input.personId || null,
        input.organizationId || null,
        input.notificationType,
        input.to,
        data?.data?.email_id || null,
        succeeded ? "accepted" : "failed",
        JSON.stringify({ smtp2go: data }),
        input.urgency,
        input.correlationId || null,
      ]
    );
  }

  if (!succeeded) {
    return { ok: false, skipped: false, reason: data?.data?.error || data?.error || "SMTP2GO rejected the email" };
  }

  return { ok: true, skipped: false, providerMessageId: data?.data?.email_id || null };
}
