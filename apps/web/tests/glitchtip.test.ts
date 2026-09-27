import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildEnvelope, buildGlitchTipEvent, createThrottle, glitchTipAuthHeader, parseGlitchTipDsn, parseStackFrames, safeRoute } from "../src/lib/glitchtip-policy.ts";

test("DSNs parse into the envelope endpoint", () => {
  const dsn = parseGlitchTipDsn("https://abc123@glitchtip.bandwagon.club/7");
  assert.deepEqual(dsn, { envelopeUrl: "https://glitchtip.bandwagon.club/api/7/envelope/", publicKey: "abc123", projectId: "7", host: "glitchtip.bandwagon.club" });
  assert.equal(parseGlitchTipDsn("https://k@example.org/prefix/3")?.envelopeUrl, "https://example.org/prefix/api/3/envelope/");
  assert.equal(parseGlitchTipDsn(""), null);
  assert.equal(parseGlitchTipDsn("http://k@example.org/1"), null, "plain http only for localhost");
  assert.equal(parseGlitchTipDsn("https://example.org/1"), null, "needs a key");
  assert.equal(parseGlitchTipDsn("https://k@example.org/abc"), null, "needs a numeric project");
  assert.match(glitchTipAuthHeader(dsn!), /sentry_key=abc123/);
});

test("events are redacted and carry no personal data", () => {
  const event = buildGlitchTipEvent({
    eventId: "e1",
    source: "server",
    name: "Error",
    message: "SMS to +1 (469) 555-0123 for jane@example.com failed, code 482913",
    stack: "Error: x\n    at send (/app/.next/server/chunks/1.js:10:5)\n    at node:internal/process/task_queues:95:5",
    route: "/api/auth/otp?token=secret123&next=/app",
    tags: { note: "call 469-555-0100" },
  });
  const text = JSON.stringify(event);
  for (const leak of ["469", "jane@example.com", "482913", "secret123", "next=/app"]) assert.ok(!text.includes(leak), `leaked ${leak}`);
  assert.equal(event.transaction, "/api/auth/otp");
  assert.equal(event.platform, "node");
  assert.equal(event.exception.values[0].stacktrace?.frames.length, 2);
  assert.equal(event.exception.values[0].stacktrace?.frames[1].in_app, true, "newest frame is last and in-app");
  assert.equal("user" in event, false);
  assert.equal("request" in event, false);
});

test("stack parsing handles anonymous frames and caps length", () => {
  const frames = parseStackFrames("Error\n    at /app/a.js:1:2\n    at named (/app/b.js:3:4)");
  assert.deepEqual(frames.map((f) => f.function), ["named", "<anonymous>"]);
  assert.equal(parseStackFrames(Array.from({ length: 80 }, (_, i) => `    at f${i} (/a.js:${i}:1)`).join("\n")).length, 50);
});

test("envelopes have a header, an item header with the right length, and the event", () => {
  const event = buildGlitchTipEvent({ eventId: "e2", source: "browser", name: "TypeError", message: "x is undefined", route: "/app" });
  const [header, item, payload] = buildEnvelope(event, "https://k@h.example/1").split("\n");
  assert.equal(JSON.parse(header).event_id, "e2");
  assert.equal(JSON.parse(item).length, Buffer.byteLength(payload));
  assert.equal(JSON.parse(payload).platform, "javascript");
});

test("the throttle sends each fingerprint once per window and caps the total", () => {
  let t = 0;
  const allow = createThrottle({ windowMs: 60_000, maxPerWindow: 2, now: () => t });
  assert.equal(allow("a"), true);
  assert.equal(allow("a"), false);
  assert.equal(allow("b"), true);
  assert.equal(allow("c"), false, "cap reached");
  t = 60_000;
  assert.equal(allow("a"), true, "new window");
});

test("safeRoute drops query strings and fragments", () => {
  assert.equal(safeRoute("/rides/r_abc?invite=xyz#top"), "/rides/r_abc");
});

test("browser reports are same-origin, size capped, rate limited, and never stored", async () => {
  const route = await readFile(new URL("../src/app/api/client-errors/route.ts", import.meta.url), "utf8");
  assert.match(route, /sameOrigin\(request\)/);
  assert.match(route, /MAX_BODY = 8 \* 1024/);
  assert.match(route, /count <= 20/);
  assert.doesNotMatch(route, /getDb|insert into/i);
  const reporter = await readFile(new URL("../src/components/client-error-reporter.tsx", import.meta.url), "utf8");
  assert.match(reporter, /MAX_REPORTS = 5/);
  assert.match(reporter, /credentials: "omit"/);
});

test("server errors, dead jobs, and failed scheduled tasks all report to GlitchTip", async () => {
  const read = (p: string) => readFile(new URL(`../src/${p}`, import.meta.url), "utf8");
  assert.match(await read("lib/error-monitoring.ts"), /reportErrorToGlitchTip\(source,\{source:"server"/);
  assert.match(await read("lib/cron-health.ts"), /source: "scheduled-task"/);
  assert.match(await read("lib/worker.ts"), /if \(dead && !job\.kind\.startsWith\("scheduled:"\)\) reportErrorToGlitchTip/);
  assert.match(await read("instrumentation-node.ts"), /unhandledRejection/);
});

test("a dead Google sign-in pauses sync instead of failing every hour", async () => {
  const google = await readFile(new URL("../src/lib/google.ts", import.meta.url), "utf8");
  assert.match(google, /body\.error === "invalid_grant" && params\.get\("grant_type"\) === "refresh_token"/);
  assert.match(google, /status='reconnect_required'/);
  const tasks = await readFile(new URL("../src/lib/scheduled-tasks.ts", import.meta.url), "utf8");
  assert.match(tasks, /No active Google Calendar connection/);
});
