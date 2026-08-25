import crypto from "node:crypto";
import { getDb } from "@/lib/db";
import { decryptSensitive, encryptSensitive, lookupHash } from "@/lib/data-security";
import { sendEmailNotification } from "@/lib/email-send";
import { sendTwilioNotification } from "@/lib/twilio-send";
import { normalizePhone } from "@/lib/accounts";
import { sessionLifetimeDays } from "@/lib/auth-policy";

const OTP_TTL_MINUTES = 10;
const SESSION_DAYS = sessionLifetimeDays(process.env.SESSION_TTL_DAYS);
const OTP_IDENTIFIER_LIMIT = 5;
const OTP_IP_LIMIT = 20;
const OTP_RATE_WINDOW_MINUTES = 15;

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

function screenedAge(birthMonth: number, birthYear: number) {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  if (!Number.isInteger(birthMonth) || birthMonth < 1 || birthMonth > 12) throw new Error("Enter a valid birth month");
  if (!Number.isInteger(birthYear) || birthYear < currentYear - 120 || birthYear > currentYear) throw new Error("Enter a valid birth year");
  // Month/year only: if the birthday falls in the current month, remain conservative until next month.
  return currentYear - birthYear - (currentMonth <= birthMonth ? 1 : 0);
}

function ageBand(age: number) {
  if (age < 13) return "under_13" as const;
  if (age < 18) return "13_17" as const;
  return "adult" as const;
}

async function findExistingAccount(type: "email" | "phone", lookup: string) {
  const db = dbRequired();
  const result = type === "email"
    ? await db.query(
        `select p.id as person_id,ua.id as user_account_id,e.verified_at is not null as contact_verified
         from emails e join people p on p.id=e.person_id join user_accounts ua on ua.person_id=p.id
         where e.normalized_email=$1 and p.status='active' and ua.status='active'
           and (
             p.person_type<>'minor'
             or not exists(select 1 from managed_student_account_access msa where msa.person_id=p.id)
             or exists(
               select 1 from managed_student_account_access msa
                where msa.person_id=p.id and msa.login_email_id=e.id and msa.enabled=true
                  and exists(select 1 from guardian_consents gc
                              where gc.minor_person_id=p.id and gc.consent_type='platform_minor_use' and gc.status='active')
             )
           )
         limit 1`,
        [lookup]
      )
    : await db.query(
        `select p.id as person_id,ua.id as user_account_id,ph.verified_at is not null as contact_verified
         from phones ph join people p on p.id=ph.person_id join user_accounts ua on ua.person_id=p.id
         where ph.lookup_hash=$1 and p.status='active' and ua.status='active'
           and (p.person_type<>'minor' or not exists(select 1 from managed_student_account_access msa where msa.person_id=p.id))
         limit 1`,
        [lookup]
      );
  return result.rows[0] || null;
}

async function findManagedStudentClaim(normalizedEmail: string) {
  const db = dbRequired();
  const result = await db.query(
    `select p.id as person_id,e.id as email_id
       from managed_student_account_access msa
       join people p on p.id=msa.person_id and p.person_type='minor' and p.status='active'
       join emails e on e.id=msa.login_email_id and e.person_id=p.id
       left join user_accounts ua on ua.person_id=p.id
      where e.normalized_email=$1 and msa.enabled=true and ua.id is null
        and exists(select 1 from guardian_consents gc
                    where gc.minor_person_id=p.id and gc.consent_type='platform_minor_use' and gc.status='active')
      limit 1`,
    [normalizedEmail]
  );
  return result.rows[0] || null;
}

export async function requestOtp(input: {
  identifier: string;
  displayName?: string | null;
  householdName?: string | null;
  birthMonth?: number | null;
  birthYear?: number | null;
  signupIntent?: boolean;
  requestIp?: string | null;
}) {
  const startedAt = Date.now();
  const db = dbRequired();
  const normalized = normalizeIdentifier(input.identifier);
  const signupIntent = input.signupIntent === true;
  const displayName = input.displayName?.trim() || null;

  if (signupIntent) {
    if (!displayName) throw new Error("Enter your name to create an account");
    if (input.birthMonth == null || input.birthYear == null) {
      throw new Error("Enter your birth month and year to create an account");
    }
    const age = screenedAge(Number(input.birthMonth), Number(input.birthYear));
    const signupAgeBand = ageBand(age);
    if (signupAgeBand === "under_13") {
      return {
        ok: false as const,
        underAge: true as const,
        message: "Direct BandWagon accounts are for ages 13+. A parent or guardian can add a younger student as a managed household profile.",
      };
    }
  }

  const ipHash = input.requestIp ? digest(`ip:${input.requestIp}`) : null;
  const existing = await findExistingAccount(normalized.type, normalized.lookup);
  const managedClaim = !existing && normalized.type === "email"
    ? await findManagedStudentClaim(normalized.destination)
    : null;
  const createNewAccount = signupIntent && !existing && !managedClaim;
  const deliverCode = Boolean(existing || managedClaim || createNewAccount);

  const id = crypto.randomUUID();
  const code = String(crypto.randomInt(100000, 1000000));
  const codeHash = digest(`${id}:${code}`);
  const purpose = managedClaim ? "managed_student_claim" : createNewAccount ? "sign_up" : "sign_in";
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    // Acquire every quota lock in stable order so both same-identifier and
    // same-IP requests serialize without creating a lock-order deadlock.
    const quotaLocks = [
      `bandwagon:otp:identifier:${normalized.lookup}`,
      ...(ipHash ? [`bandwagon:otp:ip:${ipHash}`] : []),
    ].sort();
    for (const quotaLock of quotaLocks) {
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [quotaLock]);
    }

    const identifierRate = await client.query(
      `select count(*)::int as count from auth_otp_challenges
        where identifier_lookup=$1 and created_at > now()-($2||' minutes')::interval`,
      [normalized.lookup,String(OTP_RATE_WINDOW_MINUTES)]
    );
    const ipRate = ipHash
      ? await client.query(
          `select count(*)::int as count from auth_otp_challenges
            where request_ip_hash=$1 and created_at > now()-($2||' minutes')::interval`,
          [ipHash,String(OTP_RATE_WINDOW_MINUTES)]
        )
      : { rows: [{ count: 0 }] };
    if (Number(identifierRate.rows[0]?.count || 0) >= OTP_IDENTIFIER_LIMIT || Number(ipRate.rows[0]?.count || 0) >= OTP_IP_LIMIT) {
      throw new Error("Too many verification requests. Try again shortly.");
    }

    await client.query(
      `insert into auth_otp_challenges
        (id,purpose,destination_type,identifier_lookup,destination_ciphertext,person_id,user_account_id,
         code_hash,signup_display_name,signup_household_name,signup_birth_month,signup_birth_year,request_ip_hash,expires_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now()+($14 || ' minutes')::interval)`,
      [
        id,purpose,normalized.type,normalized.lookup,encryptSensitive(normalized.destination),
        existing?.person_id || managedClaim?.person_id || null,existing?.user_account_id || null,codeHash,createNewAccount ? displayName : null,
        createNewAccount ? input.householdName?.trim() || null : null,
        createNewAccount ? input.birthMonth || null : null,createNewAccount ? input.birthYear || null : null,
        ipHash,String(OTP_TTL_MINUTES),
      ]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  let deliveryAccepted = false;
  try {
    if (!deliverCode) throw new Error("Decoy challenge");
    if (normalized.type === "email") {
      const delivery = await sendEmailNotification({
        to: normalized.destination,
        subject: "Your BandWagon verification code",
        body: `Your BandWagon verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`,
        notificationType: "otp",
        urgency: "critical",
        personId: existing?.person_id || managedClaim?.person_id || null,
        correlationId: id,
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
        correlationId: id,
      });
    }
    deliveryAccepted = true;
  } catch {}

  const minimumResponseMs = 500;
  if (Date.now()-startedAt < minimumResponseMs) {
    await new Promise((resolve) => setTimeout(resolve,minimumResponseMs-(Date.now()-startedAt)));
  }

  if (deliverCode && !deliveryAccepted) {
    await db.query(`update auth_otp_challenges set consumed_at=now() where id=$1`, [id]);
  }

  return {
    ok: true as const,
    challengeId: id,
    destinationType: normalized.type,
    ...(process.env.NODE_ENV !== "production" && process.env.AUTH_DEBUG_OTP === "true" && deliveryAccepted ? { debugCode: code } : {}),
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
      requestIp ? digest(`ip:${inputOrEmpty(requestIp)}`) : null,
      userAgent ? digest(`ua:${inputOrEmpty(userAgent)}`) : null,
    ]
  );
  return { token, sessionId: result.rows[0].id, expiresAt: result.rows[0].expires_at };
}

function inputOrEmpty(value: string) {
  return value || "";
}

export async function verifyOtp(input: {
  challengeId: string;
  code: string;
  requestIp?: string | null;
  userAgent?: string | null;
}) {
  const db = dbRequired();
  const verificationIpHash = input.requestIp ? digest(`ip:${input.requestIp}`) : null;
  if (verificationIpHash) {
    const recentFailures = await db.query(
      `select coalesce(sum(attempts),0)::int as attempts
         from auth_otp_challenges
        where request_ip_hash=$1 and created_at>now()-($2||' minutes')::interval`,
      [verificationIpHash,String(OTP_RATE_WINDOW_MINUTES)]
    );
    if (Number(recentFailures.rows[0]?.attempts || 0) >= 30) {
      throw new Error("Too many verification attempts. Try again shortly.");
    }
  }
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
      await client.query(
        `insert into auth_events(user_account_id,person_id,event_type,outcome,metadata)
         values($1,$2,'otp_verify_failed','failed',$3::jsonb)`,
        [challenge.user_account_id || null,challenge.person_id || null,JSON.stringify({ destinationType:challenge.destination_type,requestIpHash:verificationIpHash })]
      );
      await client.query("COMMIT");
      throw new Error("Incorrect verification code");
    }

    let personId = challenge.person_id as string | null;
    let userAccountId = challenge.user_account_id as string | null;
    const destination = decryptSensitive(challenge.destination_ciphertext);

    if (challenge.purpose === "managed_student_claim") {
      const eligible = await client.query(
        `select msa.login_email_id
           from managed_student_account_access msa
           join emails e on e.id=msa.login_email_id and e.person_id=msa.person_id
           join people p on p.id=msa.person_id and p.person_type='minor' and p.status='active'
          where msa.person_id=$1 and msa.enabled=true and e.normalized_email=$2
            and exists(select 1 from guardian_consents gc
                        where gc.minor_person_id=msa.person_id and gc.consent_type='platform_minor_use' and gc.status='active')
          for update`,
        [personId,normalizeEmail(destination)]
      );
      if (!eligible.rowCount || !personId) throw new Error("Student account invitation is no longer active");
      const existingAccount = await client.query(`select id from user_accounts where person_id=$1 for update`,[personId]);
      if (existingAccount.rowCount) {
        userAccountId = existingAccount.rows[0].id;
      } else {
        const account = await client.query(
          `insert into user_accounts (person_id,status,created_at,updated_at,onboarding_completed_at)
           values ($1,'active',now(),now(),now()) returning id`,
          [personId]
        );
        userAccountId = account.rows[0].id;
      }
      await client.query(`update emails set verified_at=coalesce(verified_at,now()) where id=$1`,[eligible.rows[0].login_email_id]);
      await client.query(
        `insert into audit_events(actor_person_id,action,target_type,target_id,metadata)
         values($1,'guardian.student_account_claimed','person',$1,$2::jsonb)`,
        [personId,JSON.stringify({ destinationType:"email" })]
      );
    } else if (challenge.purpose === "sign_up") {
      const age = screenedAge(Number(challenge.signup_birth_month), Number(challenge.signup_birth_year));
      const band = ageBand(age);
      if (band === "under_13") throw new Error("Direct BandWagon accounts are limited to ages 13+");
      const isMinor = band === "13_17";
      const household = await client.query(
        `insert into households (name,public_ref,status,created_at,updated_at)
         values ($1,'hh_' || lower(encode(gen_random_bytes(8),'hex')),'active',now(),now()) returning id`,
        [challenge.signup_household_name || `${challenge.signup_display_name}'s household`]
      );
      const person = await client.query(
        `insert into people
          (display_name,person_type,birth_month,birth_year,age_band,age_screened_at,student_approval_required,status,created_at,updated_at)
         values ($1,$2,$3,$4,$5,now(),$6,'active',now(),now()) returning id`,
        [challenge.signup_display_name,isMinor ? 'minor' : 'adult',challenge.signup_birth_month,challenge.signup_birth_year,band,isMinor]
      );
      personId = person.rows[0].id;
      await client.query(
        `insert into household_members (household_id,person_id,household_role,can_manage_household)
         values ($1,$2,$3,$4)`,
        [household.rows[0].id,personId,isMinor ? 'student' : 'manager',!isMinor]
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
    await client.query(
      `update notification_deliveries set person_id=$1
        where correlation_id=$2 and notification_type='otp' and person_id is null`,
      [personId,challenge.id]
    );
    await client.query(`update auth_otp_challenges set consumed_at=now(),attempts=attempts+1 where id=$1`, [challenge.id]);
    await client.query(`update user_accounts set last_login_at=now(),updated_at=now() where id=$1`, [userAccountId]);
    await client.query(
      `insert into auth_events (user_account_id,person_id,event_type,outcome,metadata)
       values ($1,$2,$3,'success',$4::jsonb)`,
      [userAccountId,personId,challenge.purpose === "sign_up" ? "account_created" : challenge.purpose === "managed_student_claim" ? "managed_student_account_claimed" : "otp_sign_in",JSON.stringify({ destinationType:challenge.destination_type,requestIpHash:verificationIpHash })]
    );
    const session = await createSession(client,userAccountId,input.requestIp,input.userAgent);
    await client.query("COMMIT");
    return { ...session, personId, userAccountId, createdAccount: challenge.purpose === "sign_up" || challenge.purpose === "managed_student_claim" };
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
