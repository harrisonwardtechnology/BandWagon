import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const script = new URL("../scripts/check-production-readiness.mjs", import.meta.url);

function run(env: Record<string, string | undefined>, profile = "core") {
  return spawnSync(process.execPath, [script.pathname, `--profile=${profile}`], {
    encoding: "utf8",
    env: { NODE_ENV: "test", PATH: process.env.PATH, ...env },
  });
}

const secret = (label: string) => `${label}-${label.repeat(40)}`;
const core = {
  APP_URL: "https://flomogo.example",
  DATABASE_URL: "postgresql://user:pass@db.example/bandwagon",
  REDIS_URL: "rediss://redis.example",
  AUTH_SECRET: secret("a"),
  DATA_ENCRYPTION_KEY: secret("b"),
  LOOKUP_HASH_KEY: secret("c"),
  S3_ENDPOINT: "https://s3.example",
  S3_REGION: "us-test-1",
  S3_ACCESS_KEY_ID: "access-key",
  S3_SECRET_ACCESS_KEY: secret("d"),
  S3_PRIVATE_BUCKET: "private",
  SMTP2GO_API_KEY: "smtp-key",
  EMAIL_FROM: "no-reply@example.com",
  SUPPORT_EMAIL: "support@example.com",
  PRIVACY_EMAIL: "privacy@example.com",
  SECURITY_EMAIL: "security@example.com",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "turnstile-site-key",
  TURNSTILE_SECRET_KEY: secret("turnstile"),
  ERROR_MONITOR_INGEST_SECRET: secret("e"),
  CALENDAR_SYNC_CRON_SECRET: secret("f"),
  DECOMMISSION_CRON_SECRET: secret("g"),
  PLATFORM_BUDGET_CRON_SECRET: secret("h"),
  PRIVACY_MAINTENANCE_CRON_SECRET: secret("i"),
  RIDE_REMINDER_CRON_SECRET: secret("j"),
  SAFETY_CRON_SECRET: secret("k"),
  STATUS_MONITORING_CRON_SECRET: secret("l"),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "vapid-public",
  VAPID_PRIVATE_KEY: "vapid-private",
  VAPID_SUBJECT: "mailto:ops@example.com",
};

test("production readiness fails closed without configuration", () => {
  const result = run({});
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DATABASE_URL: missing/);
  assert.match(result.stderr, /BLOCKED:/);
});

test("core profile passes and does not print configured values", () => {
  const result = run(core);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS: environment satisfies/);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(core.AUTH_SECRET));
});

test("FloMoGo profile keeps Twilio and Google as explicit gates", () => {
  const blocked = run(core, "flomogo");
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /TWILIO_ACCOUNT_SID: missing/);
  assert.match(blocked.stderr, /GOOGLE_CLIENT_ID: missing/);

  const ready = run({
    ...core,
    TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`,
    TWILIO_AUTH_TOKEN: secret("m"),
    TWILIO_MESSAGING_SERVICE_SID: `MG${"b".repeat(32)}`,
    GOOGLE_CLIENT_ID: "google-client-id",
    GOOGLE_CLIENT_SECRET: secret("n"),
    GOOGLE_REDIRECT_URI: "https://flomogo.example/api/integrations/google/callback",
    GOOGLE_MAPS_SERVER_API_KEY: "server-key",
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "browser-key",
  }, "flomogo");
  assert.equal(ready.status, 0, ready.stderr);
});
