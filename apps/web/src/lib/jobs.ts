import type { PoolClient } from "pg";
import { getDb } from "@/lib/db";
import { retryDelaySeconds } from "@/lib/job-policy";

export type BackgroundJob = {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
};

function dbRequired() {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

/**
 * Add a job. With a dedupeKey, a second enqueue of the same key is a no-op
 * and returns null. Pass `db` to enqueue inside an open transaction.
 */
export async function enqueueJob(input: {
  kind: string;
  payload?: Record<string, unknown>;
  runAt?: Date;
  dedupeKey?: string;
  maxAttempts?: number;
  db?: PoolClient;
}) {
  const q = input.db || dbRequired();
  const result = await q.query(
    `insert into background_jobs (kind,payload,run_at,dedupe_key,max_attempts)
     values ($1,$2::jsonb,coalesce($3,now()),$4,$5)
     on conflict (dedupe_key) do nothing
     returning id`,
    [input.kind, JSON.stringify(input.payload || {}), input.runAt || null, input.dedupeKey || null, input.maxAttempts || 5]
  );
  return (result.rows[0]?.id as string | undefined) || null;
}

/**
 * Claim up to `limit` ready jobs for this worker. Also picks up jobs whose
 * lease expired, which is how work survives a crashed or redeployed worker.
 */
export async function claimJobs(input: { workerId: string; limit: number; leaseSeconds: number; kinds?: string[] }) {
  const db = dbRequired();
  const result = await db.query(
    `with ready as (
       select id from background_jobs
        where ((status='queued' and run_at<=now())
            or (status='running' and locked_until<now() and attempts<max_attempts))
          and ($4::text[] is null or kind = any($4::text[]))
        order by run_at, id
        limit $2
        for update skip locked
     )
     update background_jobs j
        set status='running', locked_by=$1, locked_until=now()+($3||' seconds')::interval,
            attempts=j.attempts+1, started_at=now()
       from ready
      where j.id=ready.id
     returning j.id, j.kind, j.payload, j.attempts, j.max_attempts`,
    [input.workerId, input.limit, String(input.leaseSeconds), input.kinds?.length ? input.kinds : null]
  );
  return result.rows as BackgroundJob[];
}

export async function completeJob(job: BackgroundJob, workerId: string) {
  await dbRequired().query(
    `update background_jobs set status='succeeded', finished_at=now(), locked_by=null, locked_until=null, last_error=null
      where id=$1 and locked_by=$2`,
    [job.id, workerId]
  );
}

/** Retry later with backoff, or mark dead once attempts are used up. */
export async function failJob(job: BackgroundJob, workerId: string, error: unknown) {
  const message = (error instanceof Error ? error.message : String(error || "Job failed")).slice(0, 2000);
  const dead = job.attempts >= job.max_attempts;
  await dbRequired().query(
    `update background_jobs
        set status=$3, last_error=$4, locked_by=null, locked_until=null,
            run_at=case when $3='queued' then now()+($5||' seconds')::interval else run_at end,
            finished_at=case when $3='dead' then now() else null end
      where id=$1 and locked_by=$2`,
    [job.id, workerId, dead ? "dead" : "queued", message, String(retryDelaySeconds(job.attempts))]
  );
  return { dead };
}

/** Renew the lease on jobs this worker is still running, so long jobs are not stolen. */
export async function extendLeases(jobIds: string[], workerId: string, leaseSeconds: number) {
  if (!jobIds.length) return;
  await dbRequired().query(
    `update background_jobs set locked_until=now()+($3||' seconds')::interval
      where id = any($1::bigint[]) and locked_by=$2 and status='running'`,
    [jobIds, workerId, String(leaseSeconds)]
  );
}

/** Hand claimed-but-unstarted work back on shutdown so another worker takes it right away. */
export async function releaseJobs(jobIds: string[], workerId: string) {
  if (!jobIds.length) return;
  await dbRequired().query(
    `update background_jobs set status='queued', locked_by=null, locked_until=null, attempts=greatest(attempts-1,0)
      where id = any($1::bigint[]) and locked_by=$2 and status='running'`,
    [jobIds, workerId]
  );
}

/** A job whose worker died on every attempt (lease expired, no retries left) is marked dead, not retried forever. */
export async function deadLetterExpiredJobs() {
  const result = await dbRequired().query(
    `update background_jobs
        set status='dead', finished_at=now(), locked_by=null, locked_until=null,
            last_error=coalesce(last_error,'Worker stopped before finishing on every attempt')
      where status='running' and locked_until<now() and attempts>=max_attempts`
  );
  return { deadLettered: result.rowCount || 0 };
}

/** Keep finished rows for a week (for troubleshooting), dead rows for 30 days. */
export async function pruneFinishedJobs() {
  const result = await dbRequired().query(
    `delete from background_jobs
      where (status='succeeded' and finished_at<now()-interval '7 days')
         or (status='dead' and finished_at<now()-interval '30 days')`
  );
  return { deleted: result.rowCount || 0 };
}

export async function jobQueueStats() {
  const result = await dbRequired().query(
    `select
       count(*) filter (where status='queued')::int as queued,
       count(*) filter (where status='queued' and run_at<=now())::int as ready,
       count(*) filter (where status='running')::int as running,
       count(*) filter (where status='dead' and finished_at>now()-interval '24 hours')::int as dead24h,
       coalesce(extract(epoch from now()-min(run_at) filter (where status='queued' and run_at<=now())),0)::int as oldest_ready_seconds
     from background_jobs`
  );
  return result.rows[0] as { queued: number; ready: number; running: number; dead24h: number; oldest_ready_seconds: number };
}
