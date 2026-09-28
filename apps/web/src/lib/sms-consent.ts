import type { Pool, PoolClient } from "pg";
import { getDb } from "@/lib/db";
import { decryptSensitive, lookupHash } from "@/lib/data-security";
import { normalizePhoneInput } from "@/lib/phone-format";
import {
  SMS_CONSENT_TEXT,
  SMS_CONSENT_TEXT_VERSION,
  SMS_WELCOME_TEXT,
  type SmsConsentAction,
  type SmsConsentSource,
} from "@/lib/sms-consent-policy";

type Queryable = Pool | PoolClient;

/**
 * Record an opt-in or opt-out for a phone number. Writes the number-level
 * registry, every matching phone row, and an audit event. Throws on failure
 * so callers (like the Twilio webhook) can return an error and be retried.
 *
 * Pass `db` when already inside a transaction; otherwise one is opened here.
 */
export async function recordSmsConsent(input: {
  phone: string;
  action: SmsConsentAction;
  source: SmsConsentSource;
  personId?: string | null;
  db?: PoolClient;
}) {
  const e164 = normalizePhoneInput(input.phone, "US");
  if (!e164) throw new Error("A valid mobile number is required for SMS consent");
  const hash = lookupHash(e164);
  const affirmative = input.source === "signup_checkbox" || input.source === "settings";

  const run = async (q: Queryable) => {
    const state = input.action === "opt_out" ? "opted_out" : "opted_in";
    const before = await q.query(
      `select p.messaging_consent_status as phone_state, r.state as registry_state
         from (select 1) x
         left join phones p on p.lookup_hash=$1 and p.verified_at is not null
         left join sms_opt_outs r on r.lookup_hash=$1
        limit 1`,
      [hash]
    );
    const wasOptedIn = before.rows[0]?.phone_state === "opted_in" && before.rows[0]?.registry_state !== "opted_out";
    await q.query(
      `insert into sms_opt_outs (lookup_hash,state,source,updated_at) values ($1,$2,$3,now())
       on conflict (lookup_hash) do update set state=excluded.state,source=excluded.source,updated_at=now()`,
      [hash, state, input.source]
    );
    if (input.action === "opt_out") {
      await q.query(`update phones set messaging_consent_status='opted_out' where lookup_hash=$1`, [hash]);
    } else {
      // Carrier START restores a number that was on file; web consent opts in the verified phone.
      await q.query(
        `update phones set messaging_consent_status='opted_in' where lookup_hash=$1 and verified_at is not null`,
        [hash]
      );
    }
    await q.query(
      `insert into sms_consent_events (person_id,lookup_hash,action,source,consent_text,consent_text_version)
       values ($1,$2,$3,$4,$5,$6)`,
      [
        input.personId || null,
        hash,
        input.action,
        input.source,
        affirmative && input.action === "opt_in" ? SMS_CONSENT_TEXT : null,
        affirmative && input.action === "opt_in" ? SMS_CONSENT_TEXT_VERSION : null,
      ]
    );
    return { newlyOptedIn: input.action === "opt_in" && !wasOptedIn, phone: e164 };
  };

  if (input.db) return run(input.db);
  const pool = getDb();
  if (!pool) throw new Error("Database is not configured");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Send the one-time welcome text after a person opts in on the web. Best effort:
 * a failure is logged by the send path and never blocks sign-in or settings.
 * Carrier START replies come from Twilio Advanced Opt-Out, not from here.
 */
export async function sendSmsWelcome(input: { phone: string; personId: string }) {
  try {
    const { sendTwilioNotification } = await import("@/lib/twilio-send");
    await sendTwilioNotification({
      to: input.phone,
      body: SMS_WELCOME_TEXT,
      personId: input.personId,
      notificationType: "sms_welcome",
      urgency: "important",
    });
  } catch (error) {
    console.error("[sms-consent] welcome text failed", error instanceof Error ? error.message : error);
  }
}

/** Current consent for a person's verified phone, for the settings page. */
export async function getSmsConsentStatus(personId: string) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const result = await db.query(
    `select p.messaging_consent_status as phone_state, r.state as registry_state
       from phones p
       left join sms_opt_outs r on r.lookup_hash=p.lookup_hash
      where p.person_id=$1 and p.verified_at is not null
      order by p.verified_at desc limit 1`,
    [personId]
  );
  const row = result.rows[0];
  if (!row) return { hasPhone: false, optedIn: false, optedOut: false };
  const optedOut = row.registry_state === "opted_out" || row.phone_state === "opted_out";
  return { hasPhone: true, optedIn: !optedOut && row.phone_state === "opted_in", optedOut };
}

/** The person's newest verified phone number (any consent state), for web consent changes. */
export async function getAnyVerifiedPhone(personId: string) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const result = await db.query(
    `select e164_ciphertext from phones where person_id=$1 and verified_at is not null order by verified_at desc limit 1`,
    [personId]
  );
  const ciphertext = result.rows[0]?.e164_ciphertext as string | undefined;
  return ciphertext ? decryptSensitive(ciphertext) : null;
}
