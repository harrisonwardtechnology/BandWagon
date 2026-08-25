#!/usr/bin/env node

const job = process.argv[2];
const allowed = new Set(["google-calendar-sync", "microsoft-calendar-sync"]);
if (!allowed.has(job)) throw new Error("A supported calendar sync job is required");

const baseUrl = String(process.env.APP_URL || "").replace(/\/$/, "");
if (!baseUrl) throw new Error("APP_URL is required");

const secret = process.env.CALENDAR_SYNC_CRON_SECRET;
if (!secret) throw new Error("CALENDAR_SYNC_CRON_SECRET is required");

const response = await fetch(`${baseUrl}/api/cron/${job}`, {
  method: "POST",
  headers: { authorization: `Bearer ${secret}` },
  signal: AbortSignal.timeout(60_000),
});

const text = await response.text();
let result;
try { result = JSON.parse(text); } catch { result = text; }

if (!response.ok) {
  throw new Error(`${job} returned HTTP ${response.status}: ${JSON.stringify(result)}`);
}

console.log(JSON.stringify({ ok: true, job, status: response.status, result }));
