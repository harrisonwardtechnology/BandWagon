import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseAppRole, parseDisabledTasks, parseNotificationDelivery, retryDelaySeconds, runsWorker, scheduleSlot } from "../src/lib/job-policy.ts";

test("APP_ROLE defaults to all so single-container installs keep working", () => {
  assert.equal(parseAppRole(undefined), "all");
  assert.equal(parseAppRole("WEB"), "web");
  assert.equal(parseAppRole(" worker "), "worker");
  assert.equal(parseAppRole("nonsense"), "all");
  assert.equal(runsWorker("web"), false);
  assert.equal(runsWorker("worker"), true);
  assert.equal(runsWorker("all"), true);
});

test("Notification delivery is inline unless queue is chosen", () => {
  assert.equal(parseNotificationDelivery(undefined), "inline");
  assert.equal(parseNotificationDelivery("QUEUE"), "queue");
  assert.equal(parseNotificationDelivery("anything"), "inline");
});

test("Retry backoff grows and is capped at 30 minutes plus jitter", () => {
  const none = () => 0;
  assert.equal(retryDelaySeconds(1, none), 15);
  assert.equal(retryDelaySeconds(2, none), 30);
  assert.equal(retryDelaySeconds(3, none), 60);
  assert.equal(retryDelaySeconds(30, none), 1800);
  assert.equal(retryDelaySeconds(30, () => 1), 2160);
});

test("Every worker computes the same slot, so a task is enqueued once per interval", () => {
  const t = Date.UTC(2026, 8, 26, 12, 7, 30);
  assert.equal(scheduleSlot(t, 15), scheduleSlot(t + 5 * 60_000, 15));
  assert.notEqual(scheduleSlot(t, 15), scheduleSlot(t + 15 * 60_000, 15));
  assert.throws(() => scheduleSlot(t, 0));
});

test("Scheduled tasks can be switched off by name", () => {
  const disabled = parseDisabledTasks("google-calendar-sync, microsoft-calendar-sync,,");
  assert.ok(disabled.has("google-calendar-sync"));
  assert.ok(disabled.has("microsoft-calendar-sync"));
  assert.equal(disabled.size, 2);
});

test("Claims skip locked rows and reclaim expired leases", async () => {
  const jobs = await readFile(new URL("../src/lib/jobs.ts", import.meta.url), "utf8");
  assert.match(jobs, /for update skip locked/);
  assert.match(jobs, /status='running' and locked_until<now\(\) and attempts<max_attempts/);
  assert.match(jobs, /on conflict \(dedupe_key\) do nothing/);
});

test("Scheduled jobs run under an advisory lock", async () => {
  const cron = await readFile(new URL("../src/lib/cron-health.ts", import.meta.url), "utf8");
  assert.match(cron, /pg_try_advisory_lock/);
  assert.match(cron, /pg_advisory_unlock/);
});

test("Migrations take a lock so parallel containers cannot double-apply", async () => {
  const migrate = await readFile(new URL("../scripts/migrate.mjs", import.meta.url), "utf8");
  assert.match(migrate, /pg_advisory_lock/);
});

test("Webhooks dedupe on the event id with insert-on-conflict", async () => {
  const stripe = await readFile(new URL("../src/lib/stripe-support.ts", import.meta.url), "utf8");
  assert.match(stripe, /stripe_webhook_events[\s\S]*on conflict \(event_id\) do nothing/);
  const dodomain = await readFile(new URL("../src/lib/dodomain-webhook.ts", import.meta.url), "utf8");
  assert.match(dodomain, /on conflict \(event_id\) do nothing returning event_id/);
});

test("User-facing ride actions queue notifications instead of waiting on providers", async () => {
  for (const file of ["ride-lifecycle.ts", "carpool.ts", "matching.ts"]) {
    const source = await readFile(new URL(`../src/lib/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /routeNotification\(/, file);
    assert.match(source, /queueNotification\(/, file);
  }
});
