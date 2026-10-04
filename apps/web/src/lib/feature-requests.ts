import { privateHmac } from "@/lib/private-hash";
import type { SessionIdentity } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { decryptSensitive, encryptSensitive, lookupHash } from "@/lib/data-security";
import { sendEmailNotification } from "@/lib/email-send";
import { appBaseUrl, verifiedEmailsForPerson } from "@/lib/organization-requests";
import {
  FEATURE_REQUEST_CATEGORIES,
  FEATURE_REQUEST_LIMITS,
  FEATURE_REQUEST_RATE_LIMITS,
  FEATURE_REQUEST_STATUSES,
  PUBLIC_FEATURE_REQUEST_STATUSES,
  canViewRequest,
  canVoteOn,
  isFeatureRequestCategory,
  isFeatureRequestStatus,
  orderByClause,
  plainText,
  shouldNotifySubmitter,
  statusEmail,
  statusTransitionError,
  type FeatureRequestInput,
  type FeatureRequestSort,
  type FeatureRequestStatus,
} from "@/lib/feature-request-policy";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function dbRequired() {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

// Throws when neither AUTH_SECRET nor DATA_ENCRYPTION_KEY is set. There is no built-in key.
function privateKey(value: string) {
  return privateHmac(value).slice(0, 32);
}

export function clientIp(request: Request) {
  return String(request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").trim().slice(0, 100);
}

async function withinLimits(items: Array<{ key: string; limit: number }>) {
  const redis = getRedis();
  if (!redis) return true;
  if (redis.status === "wait") await redis.connect();
  for (const item of items) {
    const count = await redis.incr(item.key);
    if (count === 1) await redis.expire(item.key, 3600);
    if (count > item.limit) return false;
  }
  return true;
}

// Without Redis, count the last hour of rows in Postgres so the limits still hold.
async function submitAllowedFromDb(ip: string, who: { personId: string | null; email: string | null }) {
  const db = getDb();
  if (!db) return false;
  const result = await db.query(
    `select
       count(*) filter (where source_ip_hash = $1)::int as by_ip,
       count(*) filter (where $2::uuid is not null and person_id = $2::uuid)::int as by_person,
       count(*) filter (where $3::text is not null and email_lookup_hash = $3::text)::int as by_email
     from feature_requests
     where created_at > now() - interval '1 hour'`,
    [privateKey(ip), who.personId, who.email ? lookupHash(who.email) : null]
  );
  const row = result.rows[0] || { by_ip: 0, by_person: 0, by_email: 0 };
  return row.by_ip < FEATURE_REQUEST_RATE_LIMITS.submitPerIp
    && row.by_person < FEATURE_REQUEST_RATE_LIMITS.submitPerPerson
    && row.by_email < FEATURE_REQUEST_RATE_LIMITS.submitPerEmail;
}

async function voteAllowedFromDb(personId: string) {
  const db = getDb();
  if (!db) return false;
  const result = await db.query(
    `select count(*)::int as n from feature_request_votes where person_id = $1 and created_at > now() - interval '1 hour'`,
    [personId]
  );
  return (result.rows[0]?.n ?? 0) < FEATURE_REQUEST_RATE_LIMITS.votePerPerson;
}

/** Hourly submit limits per IP, and per person or per email. Falls back to Postgres counts when Redis isn't configured. */
export async function submitAllowed(ip: string, who: { personId: string | null; email: string | null }) {
  if (!getRedis()) return submitAllowedFromDb(ip, who);
  const items: Array<{ key: string; limit: number }> = [{ key: `feature-request:ip:${privateKey(ip)}`, limit: FEATURE_REQUEST_RATE_LIMITS.submitPerIp }];
  if (who.personId) items.push({ key: `feature-request:person:${privateKey(who.personId)}`, limit: FEATURE_REQUEST_RATE_LIMITS.submitPerPerson });
  if (who.email) items.push({ key: `feature-request:email:${privateKey(who.email)}`, limit: FEATURE_REQUEST_RATE_LIMITS.submitPerEmail });
  return withinLimits(items);
}

export async function voteAllowed(personId: string) {
  if (!getRedis()) return voteAllowedFromDb(personId);
  return withinLimits([{ key: `feature-request:vote:${privateKey(personId)}`, limit: FEATURE_REQUEST_RATE_LIMITS.votePerPerson }]);
}

async function safeSend(input: Parameters<typeof sendEmailNotification>[0]) {
  try {
    return await sendEmailNotification(input);
  } catch (error) {
    return { ok: false, skipped: false, reason: error instanceof Error ? error.message : "Email failed" };
  }
}

export async function createFeatureRequest(input: {
  identity: SessionIdentity | null;
  value: FeatureRequestInput;
  organizationId?: string | null;
  sourceIp: string | null;
}) {
  const { identity, value } = input;
  if (identity?.supportMode) throw new Error("Support View cannot submit ideas");
  const db = dbRequired();
  const organizationId = identity && input.organizationId && identity.organizationIds.includes(input.organizationId)
    ? input.organizationId
    : identity?.organizationIds[0] || null;
  const email = identity ? null : value.email;
  const result = await db.query(
    `insert into feature_requests
      (organization_id,person_id,email_ciphertext,email_lookup_hash,title,details,category,source_ip_hash)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     returning id,title,category,status,created_at`,
    [
      organizationId, identity?.personId || null,
      email ? encryptSensitive(email) : null, email ? lookupHash(email) : null,
      value.title, value.details, value.category, input.sourceIp ? privateKey(input.sourceIp) : null,
    ]
  );
  const row = result.rows[0];

  const ownerEmail = process.env.PLATFORM_OWNER_EMAIL || process.env.SUPPORT_EMAIL;
  if (ownerEmail) {
    await safeSend({
      to: ownerEmail,
      subject: `New BandWagon feature idea: ${value.title.slice(0, 80)}`,
      body: [
        identity ? `${identity.displayName} suggested a feature.` : "Someone who is not signed in suggested a feature.",
        "",
        `Title: ${value.title}`,
        `Category: ${FEATURE_REQUEST_CATEGORIES[value.category]}`,
        "",
        value.details,
        "",
        `Review it here: ${appBaseUrl()}/admin/feature-requests`,
      ].join("\n"),
      notificationType: "feature_request_submitted",
      urgency: "routine",
      correlationId: `feature-request:${row.id}`,
    });
  }
  return row;
}

/** Public ideas plus the person's own submissions, with their vote state. */
export async function listFeatureRequestsForPerson(personId: string, options: { sort: FeatureRequestSort; category?: string | null }) {
  const db = dbRequired();
  const category = isFeatureRequestCategory(options.category) ? options.category : null;
  const result = await db.query(
    `select fr.id,fr.title,fr.details,fr.category,fr.status,fr.public_note,fr.vote_count,fr.created_at,fr.status_changed_at,
            (fr.person_id=$1::uuid) as mine,
            exists(select 1 from feature_request_votes v where v.request_id=fr.id and v.person_id=$1::uuid) as has_voted,
            dup.title as duplicate_of_title
       from feature_requests fr
       left join feature_requests dup on dup.id=fr.duplicate_of_id and dup.status = any($2::text[])
      where (fr.status = any($2::text[]) or fr.person_id=$1::uuid)
        and ($3::text is null or fr.category=$3::text)
      order by ${orderByClause(options.sort)}
      limit 200`,
    [personId, PUBLIC_FEATURE_REQUEST_STATUSES, category]
  );
  return result.rows;
}

export async function setFeatureRequestVote(identity: SessionIdentity, requestId: string, vote: boolean) {
  if (identity.supportMode) throw new Error("Support View cannot vote");
  if (!UUID.test(requestId)) throw new Error("Idea not found");
  const db = dbRequired();
  const current = await db.query(`select id,status,person_id from feature_requests where id=$1::uuid`, [requestId]);
  const row = current.rows[0];
  if (!row || !canViewRequest(row, identity.personId)) throw new Error("Idea not found");
  if (vote && !canVoteOn(row.status)) throw new Error("Voting is closed for this idea");
  if (vote) {
    await db.query(
      `insert into feature_request_votes (request_id,person_id) values ($1::uuid,$2::uuid)
       on conflict (request_id,person_id) do nothing`,
      [requestId, identity.personId]
    );
  } else {
    await db.query(`delete from feature_request_votes where request_id=$1::uuid and person_id=$2::uuid`, [requestId, identity.personId]);
  }
  const updated = await db.query(
    `update feature_requests
        set vote_count=(select count(*)::int from feature_request_votes where request_id=$1::uuid)
      where id=$1::uuid
      returning vote_count`,
    [requestId]
  );
  return { voteCount: Number(updated.rows[0]?.vote_count || 0), hasVoted: vote };
}

export async function listFeatureRequestsForAdmin(options: { status?: string | null; category?: string | null; sort: FeatureRequestSort }) {
  const db = dbRequired();
  const status = isFeatureRequestStatus(options.status) ? options.status : null;
  const category = isFeatureRequestCategory(options.category) ? options.category : null;
  const result = await db.query(
    `select fr.id,fr.title,fr.details,fr.category,fr.status,fr.public_note,fr.vote_count,fr.duplicate_of_id,
            fr.created_at,fr.updated_at,fr.status_changed_at,fr.person_id,fr.email_ciphertext,
            p.display_name as submitter_name,o.name as organization_name,dup.title as duplicate_of_title,
            changer.display_name as status_changed_by_name
       from feature_requests fr
       left join people p on p.id=fr.person_id
       left join organizations o on o.id=fr.organization_id
       left join feature_requests dup on dup.id=fr.duplicate_of_id
       left join people changer on changer.id=fr.status_changed_by_person_id
      where ($1::text is null or fr.status=$1::text)
        and ($2::text is null or fr.category=$2::text)
      order by ${orderByClause(options.sort)}
      limit 300`,
    [status, category]
  );
  return result.rows.map(({ email_ciphertext, ...row }: any) => {
    let submitterEmail: string | null = null;
    if (email_ciphertext) { try { submitterEmail = decryptSensitive(email_ciphertext); } catch { submitterEmail = null; } }
    return { ...row, submitter_email: submitterEmail };
  });
}

export async function updateFeatureRequestStatus(
  identity: SessionIdentity,
  input: { requestId: string; status: string; publicNote?: unknown; duplicateOfId?: string | null }
) {
  if (!UUID.test(input.requestId)) throw new Error("Idea not found");
  if (!isFeatureRequestStatus(input.status)) throw new Error("Unknown status");
  const next: FeatureRequestStatus = input.status;
  const publicNote = input.publicNote === undefined ? undefined : plainText(input.publicNote, FEATURE_REQUEST_LIMITS.publicNoteMax, true) || null;
  let duplicateOfId = next === "duplicate" ? String(input.duplicateOfId || "").trim() || null : null;
  if (duplicateOfId && !UUID.test(duplicateOfId)) throw new Error("Choose the request this one duplicates");

  const db = dbRequired();
  const client = await db.connect();
  let before: any;
  let after: any;
  try {
    await client.query("begin");
    const locked = await client.query(`select * from feature_requests where id=$1::uuid for update`, [input.requestId]);
    before = locked.rows[0];
    if (!before) throw new Error("Idea not found");

    if (duplicateOfId) {
      const target = await client.query(`select id,status,duplicate_of_id from feature_requests where id=$1::uuid`, [duplicateOfId]);
      if (!target.rowCount) throw new Error("The original idea was not found");
      // Point at the root idea so duplicate chains stay one level deep.
      if (target.rows[0].status === "duplicate" && target.rows[0].duplicate_of_id) duplicateOfId = String(target.rows[0].duplicate_of_id);
    }
    const noteChanged = publicNote !== undefined && publicNote !== before.public_note;
    const statusChanged = before.status !== next || (next === "duplicate" && before.duplicate_of_id !== duplicateOfId);
    if (!statusChanged && !noteChanged) throw new Error("Nothing changed");
    if (statusChanged) {
      const error = statusTransitionError(before.status, next, { duplicateOfId, requestId: before.id });
      if (error) throw new Error(error);
    }

    const updated = await client.query(
      `update feature_requests
          set status=$2::text,
              duplicate_of_id=$3::uuid,
              public_note=case when $4::boolean then $5::text else public_note end,
              status_changed_at=case when $6::boolean then now() else status_changed_at end,
              status_changed_by_person_id=case when $6::boolean then $7::uuid else status_changed_by_person_id end,
              updated_at=now()
        where id=$1::uuid
        returning *`,
      [before.id, next, duplicateOfId, noteChanged, publicNote ?? null, statusChanged, identity.personId]
    );
    after = updated.rows[0];

    if (next === "duplicate" && duplicateOfId && statusChanged) {
      // Carry votes over to the original so supporters are not lost.
      await client.query(
        `insert into feature_request_votes (request_id,person_id,created_at)
         select $1::uuid,v.person_id,v.created_at from feature_request_votes v where v.request_id=$2::uuid
         on conflict (request_id,person_id) do nothing`,
        [duplicateOfId, before.id]
      );
      await client.query(
        `update feature_requests set vote_count=(select count(*)::int from feature_request_votes where request_id=$1::uuid) where id=$1::uuid`,
        [duplicateOfId]
      );
    }

    await client.query(
      `insert into audit_events (organization_id,actor_person_id,action,target_type,target_id,metadata)
       values (null,$1::uuid,$2::text,'feature_request',$3::text,$4::jsonb)`,
      [
        identity.personId,
        statusChanged ? "feature_request.status_changed" : "feature_request.note_updated",
        before.id,
        JSON.stringify({ from: before.status, to: next, duplicateOfId, publicNoteChanged: noteChanged }),
      ]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  let emailSent = false;
  if (shouldNotifySubmitter(before.status, next)) {
    let to: string | null = null;
    if (after.person_id) [to] = await verifiedEmailsForPerson(after.person_id).catch(() => [] as string[]);
    else if (after.email_ciphertext) { try { to = decryptSensitive(after.email_ciphertext); } catch { to = null; } }
    if (to) {
      const message = statusEmail({ title: after.title, status: next, publicNote: after.public_note, link: `${appBaseUrl()}/help/ideas` });
      const result = await safeSend({
        to,
        subject: message.subject,
        body: message.body,
        personId: after.person_id || null,
        organizationId: after.organization_id || null,
        notificationType: "feature_request_status",
        urgency: "routine",
        correlationId: `feature-request:${after.id}`,
      });
      emailSent = Boolean(result.ok);
    }
  }
  const { email_ciphertext: _hidden, email_lookup_hash: _hash, source_ip_hash: _ip, ...safe } = after;
  return { request: safe, emailSent, statusLabel: FEATURE_REQUEST_STATUSES[next] };
}
