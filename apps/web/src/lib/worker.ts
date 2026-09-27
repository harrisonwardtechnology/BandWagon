import crypto from "node:crypto";
import os from "node:os";
import { claimJobs, completeJob, enqueueJob, extendLeases, failJob, releaseJobs, type BackgroundJob } from "@/lib/jobs";
import { parseDisabledTasks, scheduleSlot } from "@/lib/job-policy";
import { recordHeartbeat } from "@/lib/platform-health";
import { SCHEDULED_TASKS, runScheduledTask, scheduledJobKind } from "@/lib/scheduled-tasks";

// One worker loop per process. Started from instrumentation.ts when
// APP_ROLE is "worker" (or "all" for single-container installs). Any number
// of workers can run: jobs are claimed with SKIP LOCKED and a lease, and the
// scheduler dedupes each task per time slot, so nothing runs twice.

const POLL_MS = Number(process.env.WORKER_POLL_MS || 1000);
const CONCURRENCY = Math.max(1, Math.min(20, Number(process.env.WORKER_CONCURRENCY || 4)));
const LEASE_SECONDS = Math.max(45, Number(process.env.WORKER_LEASE_SECONDS || 90));
const SCHEDULER_TICK_MS = 30_000;
const HEARTBEAT_MS = 20_000;

type WorkerState = { id: string; stopping: boolean; running: Map<string, Promise<void>>; started: boolean };
const globalKey = Symbol.for("bandwagon.worker");
const g = globalThis as unknown as { [globalKey]?: WorkerState };

function log(event: string, data: Record<string, unknown> = {}) {
  console.info(JSON.stringify({ at: new Date().toISOString(), component: "worker", event, ...data }));
}

async function handle(job: BackgroundJob) {
  if (job.kind === "notification.deliver") {
    const { routeNotification } = await import("@/lib/notification-router");
    return routeNotification(job.payload as any);
  }
  if (job.kind.startsWith("scheduled:")) {
    return runScheduledTask(job.kind.slice("scheduled:".length));
  }
  throw new Error(`No handler for job kind ${job.kind}`);
}

async function runJob(state: WorkerState, job: BackgroundJob) {
  const started = Date.now();
  try {
    await handle(job);
    await completeJob(job, state.id);
    log("job.succeeded", { jobId: job.id, kind: job.kind, attempt: job.attempts, ms: Date.now() - started });
  } catch (error) {
    const { dead } = await failJob(job, state.id, error).catch(() => ({ dead: false }));
    log(dead ? "job.dead" : "job.retry", { jobId: job.id, kind: job.kind, attempt: job.attempts, error: error instanceof Error ? error.message : String(error) });
  }
}

async function pollOnce(state: WorkerState) {
  const free = CONCURRENCY - state.running.size;
  if (free <= 0 || state.stopping) return 0;
  const jobs = await claimJobs({ workerId: state.id, limit: free, leaseSeconds: LEASE_SECONDS });
  for (const job of jobs) {
    const promise = runJob(state, job).finally(() => state.running.delete(job.id));
    state.running.set(job.id, promise);
  }
  return jobs.length;
}

async function schedulerTick() {
  const disabled = parseDisabledTasks(process.env.SCHEDULER_DISABLED_TASKS);
  const now = Date.now();
  for (const task of SCHEDULED_TASKS) {
    if (disabled.has(task.key)) continue;
    const slot = scheduleSlot(now, task.everyMinutes);
    // Same key from every worker => one job per task per interval.
    await enqueueJob({ kind: scheduledJobKind(task.key), dedupeKey: `${task.key}:${slot}`, maxAttempts: 2 }).catch((error) =>
      log("scheduler.enqueue_failed", { task: task.key, error: error instanceof Error ? error.message : String(error) })
    );
  }
}

async function heartbeat(state: WorkerState) {
  // Renew leases first: a crashed worker stops renewing and its jobs free up within LEASE_SECONDS.
  await extendLeases([...state.running.keys()], state.id, LEASE_SECONDS).catch(() => {});
  await recordHeartbeat({
    // One shared row: it goes stale only when no worker at all is alive.
    key: "worker-pool",
    type: "service",
    ok: true,
    metadata: { lastWorkerId: state.id, host: os.hostname(), running: state.running.size, concurrency: CONCURRENCY, expectedMaxAgeMinutes: 3 },
  }).catch(() => {});
  const kuma = process.env.WORKER_KUMA_PUSH_URL;
  if (kuma) {
    const url = new URL(kuma);
    url.searchParams.set("status", "up");
    url.searchParams.set("msg", `worker ${state.id} ok, ${state.running.size} running`);
    await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) }).catch(() => {});
  }
}

function every(ms: number, fn: () => Promise<unknown>, state: WorkerState) {
  const loop = async () => {
    if (state.stopping) return;
    try { await fn(); } catch (error) { log("loop.error", { error: error instanceof Error ? error.message : String(error) }); }
    if (!state.stopping) setTimeout(loop, ms).unref();
  };
  setTimeout(loop, Math.round(Math.random() * 1000)).unref();
}

export function startWorker() {
  if (g[globalKey]?.started) return g[globalKey]!;
  const state: WorkerState = {
    id: `${os.hostname()}-${process.pid}-${crypto.randomBytes(3).toString("hex")}`,
    stopping: false,
    running: new Map(),
    started: true,
  };
  g[globalKey] = state;
  log("worker.started", { workerId: state.id, concurrency: CONCURRENCY, leaseSeconds: LEASE_SECONDS });

  // Poll faster while there is work, back off to POLL_MS when idle.
  const poll = async () => {
    if (state.stopping) return;
    let claimed = 0;
    try { claimed = await pollOnce(state); } catch (error) { log("poll.error", { error: error instanceof Error ? error.message : String(error) }); }
    if (!state.stopping) setTimeout(poll, claimed > 0 ? 50 : POLL_MS).unref();
  };
  setTimeout(poll, 500).unref();
  every(SCHEDULER_TICK_MS, schedulerTick, state);
  every(HEARTBEAT_MS, () => heartbeat(state), state);

  // On redeploy: stop claiming, let running jobs finish briefly, hand the rest back.
  const shutdown = async (signal: string) => {
    if (state.stopping) return;
    state.stopping = true;
    log("worker.stopping", { signal, running: state.running.size });
    const graceMs = Number(process.env.WORKER_SHUTDOWN_GRACE_MS || 20_000);
    await Promise.race([Promise.allSettled([...state.running.values()]), new Promise((r) => setTimeout(r, graceMs))]);
    await releaseJobs([...state.running.keys()], state.id).catch(() => {});
    log("worker.stopped", { released: state.running.size });
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
  return state;
}

export function workerStatus() {
  const state = g[globalKey];
  return state ? { id: state.id, running: state.running.size, stopping: state.stopping } : null;
}
