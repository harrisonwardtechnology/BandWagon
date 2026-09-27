// Pure helpers for sending errors to GlitchTip (Sentry-compatible API).
// No "@/" imports so tests can load this file directly.
//
// Everything sent is already redacted by redactApplicationErrorText and
// carries no user id, email, IP, cookies, headers, or request bodies.

import { redactApplicationErrorText } from "./error-monitoring-policy.ts";

export type GlitchTipDsn = { envelopeUrl: string; publicKey: string; projectId: string; host: string };

/** DSN looks like https://<publicKey>@glitchtip.example.com/<projectId> */
export function parseGlitchTipDsn(value: string | undefined | null): GlitchTipDsn | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) return null;
  const publicKey = decodeURIComponent(url.username);
  const segments = url.pathname.split("/").filter(Boolean);
  const projectId = segments.pop() || "";
  if (!publicKey || !/^\d+$/.test(projectId)) return null;
  const prefix = segments.length ? `/${segments.join("/")}` : "";
  return { envelopeUrl: `${url.protocol}//${url.host}${prefix}/api/${projectId}/envelope/`, publicKey, projectId, host: url.host };
}

export function glitchTipAuthHeader(dsn: GlitchTipDsn) {
  return `Sentry sentry_version=7, sentry_client=bandwagon/1.0, sentry_key=${dsn.publicKey}`;
}

type Frame = { function?: string; filename?: string; lineno?: number; colno?: number; in_app?: boolean };

/** Turn a V8 stack ("at fn (file:line:col)") into Sentry frames, oldest call first. */
export function parseStackFrames(stack: string | null | undefined): Frame[] {
  const frames: Frame[] = [];
  for (const line of String(stack || "").split("\n")) {
    const m = line.match(/^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?\s*$/);
    if (!m) continue;
    const filename = m[2].replace(/^file:\/\//, "");
    frames.push({
      function: m[1] || "<anonymous>",
      filename,
      lineno: Number(m[3]),
      colno: Number(m[4]),
      in_app: !/node_modules|node:internal|^node:/.test(filename),
    });
    if (frames.length >= 50) break;
  }
  return frames.reverse();
}

/** Drop query strings and fragments, then redact, so ride refs in paths are the most that leaks. */
export function safeRoute(value: string | null | undefined) {
  return redactApplicationErrorText(String(value || "unknown").split(/[?#]/)[0]).slice(0, 300);
}

export type GlitchTipEventInput = {
  name: string;
  message: string;
  stack?: string | null;
  route?: string | null;
  method?: string | null;
  level?: "fatal" | "error" | "warning" | "info";
  source: "server" | "browser" | "worker" | "scheduled-task";
  tags?: Record<string, string | number | boolean | null | undefined>;
  environment?: string;
  release?: string | null;
  serverName?: string | null;
  fingerprint?: string[];
  eventId: string;
  timestamp?: Date;
};

export function buildGlitchTipEvent(input: GlitchTipEventInput) {
  const name = String(input.name || "Error").slice(0, 120);
  const message = redactApplicationErrorText(String(input.message || "Application error")).slice(0, 1000);
  const stack = input.stack ? redactApplicationErrorText(input.stack).slice(0, 8000) : null;
  const route = safeRoute(input.route);
  const tags: Record<string, string> = { source: input.source, route };
  if (input.method) tags.method = String(input.method).toUpperCase().slice(0, 10);
  for (const [key, value] of Object.entries(input.tags || {})) {
    if (value !== undefined && value !== null) tags[key.slice(0, 32)] = redactApplicationErrorText(String(value)).slice(0, 200);
  }
  const frames = parseStackFrames(stack);
  return {
    event_id: input.eventId,
    timestamp: (input.timestamp || new Date()).toISOString(),
    platform: input.source === "browser" ? "javascript" : "node",
    level: input.level || "error",
    logger: `bandwagon.${input.source}`,
    environment: input.environment || "production",
    release: input.release || undefined,
    server_name: input.serverName || undefined,
    transaction: route,
    tags,
    fingerprint: input.fingerprint,
    exception: { values: [{ type: name, value: message, ...(frames.length ? { stacktrace: { frames } } : {}) }] },
  };
}

/** Sentry envelope: header line, item header line, item payload. */
export function buildEnvelope(event: ReturnType<typeof buildGlitchTipEvent>, dsnRaw: string) {
  const payload = JSON.stringify(event);
  return [
    JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString(), dsn: dsnRaw }),
    JSON.stringify({ type: "event", content_type: "application/json", length: Buffer.byteLength(payload) }),
    payload,
  ].join("\n");
}

/**
 * Per-process flood guard: the same fingerprint is sent at most once per
 * window, and at most `maxPerWindow` events overall. A bad deploy should
 * make one loud issue in GlitchTip, not thousands of requests.
 */
export function createThrottle(options: { windowMs: number; maxPerWindow: number; now?: () => number }) {
  const now = options.now || Date.now;
  const seen = new Map<string, number>();
  let windowStart = now();
  let count = 0;
  return (key: string) => {
    const t = now();
    if (t - windowStart >= options.windowMs) { windowStart = t; count = 0; seen.clear(); }
    if (seen.has(key) || count >= options.maxPerWindow) return false;
    seen.set(key, t);
    count++;
    return true;
  };
}
