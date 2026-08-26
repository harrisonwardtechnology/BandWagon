#!/usr/bin/env node

const requestedProfile = process.argv.find((arg) => arg.startsWith("--profile="))?.split("=")[1] || "core";
if (!new Set(["core", "flomogo"]).has(requestedProfile)) {
  console.error("Usage: node scripts/check-production-readiness.mjs [--profile=core|flomogo]");
  process.exit(2);
}

const failures = [];
const warnings = [];
const checked = [];
const value = (name) => (process.env[name] || "").trim();

function requireValue(name, { minLength = 1, pattern, description } = {}) {
  const current = value(name);
  if (!current) failures.push(`${name}: missing${description ? ` (${description})` : ""}`);
  else if (current.length < minLength) failures.push(`${name}: must be at least ${minLength} characters`);
  else if (pattern && !pattern.test(current)) failures.push(`${name}: invalid format`);
  else checked.push(name);
}

function requireUrl(name, { https = false } = {}) {
  const current = value(name);
  try {
    const parsed = new URL(current);
    if (https && parsed.protocol !== "https:") throw new Error("HTTPS required");
    checked.push(name);
  } catch {
    failures.push(`${name}: must be a valid${https ? " HTTPS" : ""} URL`);
  }
}

function requireEmail(name) {
  requireValue(name, { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ });
}

function requireSecret(name) {
  requireValue(name, { minLength: 32 });
  const normalized = value(name).toLowerCase();
  if (["changeme", "change-me", "test", "secret", "password"].includes(normalized)) {
    failures.push(`${name}: insecure placeholder value`);
  }
}

requireUrl("APP_URL", { https: true });
requireValue("DATABASE_URL", { pattern: /^postgres(?:ql)?:\/\// });
requireValue("REDIS_URL", { pattern: /^rediss?:\/\// });
requireSecret("AUTH_SECRET");
requireSecret("DATA_ENCRYPTION_KEY");
requireSecret("LOOKUP_HASH_KEY");

requireUrl("S3_ENDPOINT", { https: true });
requireValue("S3_REGION");
requireValue("S3_ACCESS_KEY_ID");
requireSecret("S3_SECRET_ACCESS_KEY");
requireValue("S3_PRIVATE_BUCKET");

requireValue("SMTP2GO_API_KEY");
requireEmail("EMAIL_FROM");
requireEmail("SUPPORT_EMAIL");
requireEmail("PRIVACY_EMAIL");
requireEmail("SECURITY_EMAIL");
requireValue("NEXT_PUBLIC_TURNSTILE_SITE_KEY");
requireSecret("TURNSTILE_SECRET_KEY");

for (const name of [
  "ERROR_MONITOR_INGEST_SECRET",
  "CALENDAR_SYNC_CRON_SECRET",
  "DECOMMISSION_CRON_SECRET",
  "PLATFORM_BUDGET_CRON_SECRET",
  "PRIVACY_MAINTENANCE_CRON_SECRET",
  "RIDE_REMINDER_CRON_SECRET",
  "SAFETY_CRON_SECRET",
  "STATUS_MONITORING_CRON_SECRET",
]) requireSecret(name);

requireValue("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
requireValue("VAPID_PRIVATE_KEY");
requireValue("VAPID_SUBJECT", { pattern: /^(mailto:|https:)/ });

const uniqueSecrets = [
  "AUTH_SECRET",
  "DATA_ENCRYPTION_KEY",
  "LOOKUP_HASH_KEY",
  "ERROR_MONITOR_INGEST_SECRET",
].filter((name) => value(name));
for (let i = 0; i < uniqueSecrets.length; i += 1) {
  for (let j = i + 1; j < uniqueSecrets.length; j += 1) {
    if (value(uniqueSecrets[i]) === value(uniqueSecrets[j])) {
      failures.push(`${uniqueSecrets[i]} and ${uniqueSecrets[j]} must be different values`);
    }
  }
}

if (requestedProfile === "flomogo") {
  requireValue("TWILIO_ACCOUNT_SID", { pattern: /^AC[a-fA-F0-9]{32}$/ });
  requireSecret("TWILIO_AUTH_TOKEN");
  requireValue("TWILIO_MESSAGING_SERVICE_SID", { pattern: /^MG[a-fA-F0-9]{32}$/ });
  requireValue("GOOGLE_CLIENT_ID");
  requireSecret("GOOGLE_CLIENT_SECRET");
  requireUrl("GOOGLE_REDIRECT_URI", { https: true });
  requireValue("GOOGLE_MAPS_SERVER_API_KEY");
  requireValue("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY");
}

if (value("AI_RUNTIME_ENABLED").toLowerCase() === "true") {
  requireUrl("LITELLM_BASE_URL", { https: value("LITELLM_ALLOW_HTTP") !== "true" });
  requireSecret("LITELLM_API_KEY");
  requireValue("AI_FAST_MODEL");
  requireValue("AI_BALANCED_MODEL");
  requireValue("AI_DEEP_MODEL");
} else {
  warnings.push("AI runtime is disabled; AI-assisted intake and document processing will use manual fallback.");
}

console.log(`BandWagon production readiness: ${requestedProfile} profile`);
console.log(`Checked ${new Set(checked).size} configured controls without printing secret values.`);
for (const warning of warnings) console.log(`WARN: ${warning}`);
for (const failure of [...new Set(failures)]) console.error(`FAIL: ${failure}`);

if (failures.length) {
  console.error(`BLOCKED: ${new Set(failures).size} production readiness issue(s).`);
  process.exit(1);
}

console.log("PASS: environment satisfies this production readiness profile.");
