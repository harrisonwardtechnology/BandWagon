import crypto from "node:crypto";
import { getDb } from "@/lib/db";
import { decryptSensitive, encryptSensitive, lookupHash } from "@/lib/data-security";
import { sendEmailNotification } from "@/lib/email-send";
import { sendTwilioNotification } from "@/lib/twilio-send";
import { normalizePhone } from "@/lib/accounts";

const OTP_TTL_MINUTES = 10;
const SESSION_DAYS = 30;

function dbRequired() {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

function authKey() {
  const value = process.env.AUTH_SECRET || process.env.DATA_ENCRYPTION_KEY;
  if (!value) throw new Error("AUTH_SECRET or DATA_ENCRYPTION_KEY is required");
  return value;
}

function digest(value: string) {
  return crypto.createHmac("sha256", authKey()).update(value).digest("hex");
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address");
  return email;
}

function normalizeIdentifier(value: string) {
  const raw = value.trim();
  if (raw.includes("@")) {
    const email = normalizeEmail(raw);
    return { type: "email" as const, destination: email, lookup: email };
  }
  const phone = normalizePhone(raw);
  return { type: "phone" as const, destination: phone, lookup: lookupHash(phone) };
}

async function findExistingAccount(type: "email" | "phone", lookup: string) {
  const db = dbRequired();
  const result = type === "email"
    ? await db.query(
        `select p.id as person_id,ua.id as user_account_id,e.verified_at is not null as contact_verified
         from emails e join people p on p.id=e.person_id join user_accounts ua on ua.person_id=p.id
         where e.normalized_email=$1 and p.status='active' and ua.status='active' limit 1`,
        [lookup]
      )
    : await db.query(
        `select p.id as person_id,ua.id as user_account_id,ph.verified_at is not null as contact_verified
         from phones ph join people p on p.id=ph.person_id join user_accounts ua on ua.person_id=p.id
         where ph.lookup_hash=$1 and p.status='active' and ua.status='active' limit 1`,
        [lookup]
      );
  return result.rows[0] || null;
}

export async function requestOtp(input: {
  identifier: string;
  displayName?: string | null;
  householdName?: string | null;
  requestIp?: string | null;
}) {
  const db = dbRequired();
  const normalized = normalizeIdentifier(input.identifier);
  const existing = await findExistingAccount(normalized.type, normalized.lookup);
  const displayName = input.displayName?.trim() || null;
  if (!existing && !displayName) {
    return { ok: false as const, signupDetailsRequired: true as const };
  }

  const recent = await db.query(
    `select count(*)::int as count from auth_otp_challenges
     where identifier_lookup=$1 and created_at > now() - interval '15 minutes'`,
    [normalized.lookup]
  );
  if (Number(recent.rows[0]?.count || 0) >= 5) throw new Error("Too many verification requests. Try again shortly.");

  const id = crypto.randomUUID();
  const code = String(crypto.randomInt(100000, 1000000));
  const codeHash = digest(`${id}:${code}`);
  const purpose = existing ? "sign_in" : "sign_up";
  await db.query(
    `insert into auth_otp_challenges
      (id,purpose,destination_type,identifier_lookup,destination_ciphertext,person_id,user_account_id,
       code_hash,signup_display_name,signup_household_name,request_ip_hash,expires_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now()+($12 || ' minutes')::interval)`,
    [
      id,purpose,normalized.type,normalized.lookup,encryptSensitive(normalized.destination),
      existing?.person_id || null,existing?.user_account_id || null,codeHash,displayName,
      input.householdName?.trim() || null,input.requestIp ? digest(`ip:${input.requestIp}`) : null,String(OTP_TTL_MINUTES),
    ]
  );

  try {
    if (normalized.type === "email") {
      const delivery = await sendEmailNotification({
        to: normalized.destination,
        subject: "Your BandWagon verification code",
        body: `Your BandWagon verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`,
        notificationType: "otp",
        urgency: "critical",
        personId: existing?.person_id || null,
      });
      if (!delivery.ok) throw new Error(delivery.reason || "Email verification delivery failed");
    } else {
      await sendTwilioNotification({
        to: normalized.destination,
        body: `BandWagon verification code: ${code}. Expires in ${OTP_TTL_MINUTES} minutes.`,
        mode: "auto",
        notificationType: "otp",
        urgency: "critical",
        personId: existing?.person_id || null,
      });
    }
  } catch (error) {
    await db.query(`update auth_otp_challenges set consumed_at=now() where id=$1`, [id]);
    throw error;
  }

  return {
    ok: true as const,
    challengeId: id,
    destinationType: normalized.type,
    signup: !existing,
    ...(process.env.AUTH_DEBUG_OTP === "true" ? { debugCode: code } : {}),
  };
}

async function createSession(client: any, userAccountId: string, requestIp?: string | null, userAgent?: string | null) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = digest(`session:${token}`);
  const result = await client.query(
    `insert into auth_sessions (user_account_id,token_hash,expires_at,ip_hash,user_agent_hash)
     values ($1,$2,now()+($3 || ' days')::interval,$4,$5) returning id,expires_at`,
    [
      userAccountId,tokenHash,String(SESSION_DAYS),
      requestIp ? digest(`ip:${requestIp}`) : null,
      userAgent ? digest(`ua:${userAgent}`) : null,
    ]
  );
  return { token, sessionId: result.rows[0].id, expiresAt: result.rows[0].expires_at };
}

export async function verifyOtp(input: {
  challengeId: string;
  code: string;
  requestIp?: string | null;
  userAgent?: string | null;
}) {
  const db = dbRequired();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const challengeResult = await client.query(`select * from auth_otp_challenges where id=$1 for update`, [input.challengeId]);
    if (!challengeResult.rowCount) throw new Error("Verification request not found");
    const challenge = challengeResult.rows[0];
    if (challenge.consumed_at) throw new Error("Verification code has already been used");
    if (new Date(challenge.expires_at).getTime() < Date.now()) throw new Error("Verification code has expired");
    if (Number(challenge.attempts) >= Number(challenge.max_attempts)) throw new Error("Too many verification attempts");

    const suppliedHash = digest(`${challenge.id}:${String(input.code).trim()}`);
    const valid = crypto.timingSafeEqual(Buffer.from(suppliedHash), Buffer.from(challenge.code_hash));
    if (!valid) {
      await client.query(`update auth_otp_challenges set attempts=attempts+1 where id=$1`, [challenge.id]);
      await client.query("COMMIT");
      throw new Error("Incorrect verification code");
    }

    let personId = challenge.person_id as string | null;
    let userAccountId = challenge.user_account_id as string | null;
    const destination = decryptSensitive(challenge.destination_ciphertext);

    if (challenge.purpose === "sign_up") {
      const household = await client.query(
        `insert into households (name,public_ref,status,created_at,updated_at)
         values ($1,'hh_' || lower(encode(gen_random_bytes(8),'hex')),'active',now(),now()) returning id`,
        [challenge.signup_household_name || `${challenge.signup_display_name}'s household`]
      );
      const person = await client.query(
        `insert into people (display_name,person_type,status,created_at,updated_at)
         values ($1,'adult','active',now(),now()) returning id`,
        [challenge.signup_display_name]
      );
      personId = person.rows[0].id;
      await client.query(
        `insert into household_members (household_id,person_id,household_role,can_manage_household)
         values ($1,$2,'manager',true)`,
        [household.rows[0].id,personId]
      );
      await client.query(`update people set household_id=$1 where id=$2`, [household.rows[0].id,personId]);
      const account = await client.query(
        `insert into user_accounts (person_id,status,created_at,updated_at,onboarding_completed_at)
         values ($1,'active',now(),now(),now()) returning id`,
        [personId]
      );
      userAccountId = account.rows[0].id;
      if (challenge.destination_type === "email") {
        await client.query(
          `insert into emails (person_id,normalized_email,verified_at,visibility) values ($1,$2,now(),'hidden')`,
          [personId,normalizeEmail(destination)]
        );
      } else {
        const phone = normalizePhone(destination);
        await client.query(
          `insert into phones (person_id,e164_ciphertext,lookup_hash,verified_at,visibility,messaging_consent_status)
           values ($1,$2,$3,now(),'hidden','opted_in')`,
          [personId,encryptSensitive(phone),lookupHash(phone)]
        );
      }
    } else if (personId) {
      if (challenge.destination_type === "email") {
        await client.query(`update emails set verified_at=coalesce(verified_at,now()) where person_id=$1 and normalized_email=$2`, [personId,normalizeEmail(destination)]);
      } else {
        await client.query(`update phones set verified_at=coalesce(verified_at,now()) where person_id=$1 and lookup_hash=$2`, [personId,lookupHash(normalizePhone(destination))]);
      }
    }

    if (!personId || !userAccountId) throw new Error("Account is unavailable");
    await client.query(`update auth_otp_challenges set consumed_at=now(),attempts=attempts+1 where id=$1`, [challenge.id]);
    await client.query(`update user_accounts set last_login_at=now(),updated_at=now() where id=$1`, [userAccountId]);
    await client.query(
      `insert into auth_events (user_account_id,person_id,event_type,outcome,metadata)
       values ($1,$2,$3,'success',$4::jsonb)`,
      [userAccountId,personId,challenge.purpose === "sign_up" ? "account_created" : "otp_sign_in",JSON.stringify({ destinationType:challenge.destination_type })]
    );
    const session = await createSession(client,userAccountId,input.requestIp,input.userAgent);
    await client.query("COMMIT");
    return { ...session, personId, userAccountId, createdAccount: challenge.purpose === "sign_up" };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function sessionTokenHash(token: string) {
  return digest(`session:${token}`);
}

export async function revokeSessionByToken(token: string) {
  const db = dbRequired();
  await db.query(`update auth_sessions set revoked_at=now() where token_hash=$1 and revoked_at is null`, [sessionTokenHash(token)]);
}
