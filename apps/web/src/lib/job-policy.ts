// Pure rules for the background job queue. No imports so it can be unit tested.

export type AppRole = "all" | "web" | "worker";

/** APP_ROLE decides what this process does. "all" keeps single-container deploys working. */
export function parseAppRole(value: string | undefined | null): AppRole {
  const role = String(value || "all").trim().toLowerCase();
  return role === "web" || role === "worker" ? role : "all";
}

export function runsWorker(role: AppRole) {
  return role === "worker" || role === "all";
}

/** "queue" hands notifications to workers; "inline" sends them inside the request (old behavior). */
export function parseNotificationDelivery(value: string | undefined | null): "queue" | "inline" {
  return String(value || "inline").trim().toLowerCase() === "queue" ? "queue" : "inline";
}

/** Exponential backoff with a cap: 15s, 30s, 60s, 2m, 4m ... max 30m, plus up to 20% jitter. */
export function retryDelaySeconds(attempts: number, random: () => number = Math.random) {
  const base = Math.min(15 * 2 ** Math.max(0, attempts - 1), 30 * 60);
  return Math.round(base + base * 0.2 * random());
}

/**
 * The time slot a scheduled task belongs to. Enqueueing with the dedupe key
 * `${task}:${slot}` means every worker can run the scheduler and each task
 * still fires once per interval.
 */
export function scheduleSlot(nowMs: number, everyMinutes: number) {
  if (!Number.isFinite(everyMinutes) || everyMinutes <= 0) throw new Error("everyMinutes must be positive");
  return Math.floor(nowMs / (everyMinutes * 60_000));
}

export function parseDisabledTasks(value: string | undefined | null) {
  return new Set(String(value || "").split(",").map((part) => part.trim()).filter(Boolean));
}
