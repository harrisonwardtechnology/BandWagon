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

// Optional public links. Blank is allowed; a set value must be a real HTTPS URL.
for (const name of ["NEXT_PUBLIC_HELP_DESK_URL", "NEXT_PUBLIC_STATUS_PAGE_URL"]) {
  if (value(name)) requireUrl(name, { https: true });
  else warnings.push(`${name} is not set; ${name === "NEXT_PUBLIC_HELP_DESK_URL" ? "support links fall back to email" : "/status shows only the live check"}.`);
}

// Error tracking (GlitchTip, Sentry-compatible). Optional but recommended.
if (value("GLITCHTIP_DSN")) {
  if (!/^https:\/\/[^@\s]+@[^/\s]+\/(?:[^\s]*\/)?\d+$/.test(value("GLITCHTIP_DSN"))) failures.push("GLITCHTIP_DSN must look like https://<key>@<glitchtip host>/<project id>");
} else {
  warnings.push("GLITCHTIP_DSN is not set; errors are only stored in the local application_errors table.");
}

// Domain settings. Defaults are bandwagon.club (platform + tenants).
for (const host of value("PLATFORM_HOSTNAMES").split(",").map((h) => h.trim()).filter(Boolean)) {
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) failures.push(`PLATFORM_HOSTNAMES: invalid hostname "${host}"`);
}
if (value("TENANT_BASE_DOMAIN") && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value("TENANT_BASE_DOMAIN"))) {
  failures.push("TENANT_BASE_DOMAIN: invalid domain");
}
// APP_URL drives OAuth redirects, Twilio signatures, and email links, so it must
// be the primary product host.
{
  const primary = (value("PLATFORM_HOSTNAMES").split(",")[0] || "bandwagon.club").trim().toLowerCase();
  let appHost = "";
  try { appHost = new URL(value("APP_URL")).hostname.toLowerCase(); } catch {}
  if (appHost && appHost !== primary && !["localhost", "127.0.0.1"].includes(appHost)) {
    const message = `APP_URL host "${appHost}" does not match the primary platform host "${primary}"`;
    // Hard failure once PLATFORM_HOSTNAMES is set explicitly; a warning while it is left at the default.
    if (value("PLATFORM_HOSTNAMES")) failures.push(message);
    else warnings.push(`${message}. Set PLATFORM_HOSTNAMES to match.`);
  }
}

// Staging safety: the sandbox must never be on in production, and staging must
// never run without it (the app forces it on for staging, this makes it explicit).
const environment = value("NEXT_PUBLIC_ENVIRONMENT").toLowerCase() || "production";
const sandbox = ["true", "1", "yes", "on"].includes(value("MESSAGING_SANDBOX").toLowerCase());
if (environment === "production" && sandbox) {
  failures.push("MESSAGING_SANDBOX: must not be true in production (real members would not receive messages)");
}
if (environment === "staging" && !sandbox) {
  warnings.push("NEXT_PUBLIC_ENVIRONMENT=staging forces the messaging sandbox on; set MESSAGING_SANDBOX=true to make that explicit.");
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
