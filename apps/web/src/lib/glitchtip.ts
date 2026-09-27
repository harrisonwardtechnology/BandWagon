import crypto from "node:crypto";
import os from "node:os";
import { buildEnvelope, buildGlitchTipEvent, createThrottle, glitchTipAuthHeader, parseGlitchTipDsn, type GlitchTipEventInput } from "@/lib/glitchtip-policy";

// Sends errors to a self-hosted GlitchTip (Sentry-compatible). Off unless
// GLITCHTIP_DSN is set. Never throws and never blocks longer than 3 seconds,
// so monitoring can't take the app down.

const throttle = createThrottle({ windowMs: 60_000, maxPerWindow: Number(process.env.GLITCHTIP_MAX_EVENTS_PER_MINUTE || 60) });

export function glitchTipConfigured() {
  return Boolean(parseGlitchTipDsn(process.env.GLITCHTIP_DSN));
}

export function glitchTipEnvironment() {
  return process.env.GLITCHTIP_ENVIRONMENT || process.env.NEXT_PUBLIC_ENVIRONMENT || process.env.NODE_ENV || "production";
}

export function glitchTipRelease() {
  // Coolify sets SOURCE_COMMIT on builds from git.
  return process.env.GLITCHTIP_RELEASE || process.env.SOURCE_COMMIT || null;
}

export async function reportToGlitchTip(input: Omit<GlitchTipEventInput, "eventId" | "environment" | "release" | "serverName">) {
  const raw = process.env.GLITCHTIP_DSN;
  const dsn = parseGlitchTipDsn(raw);
  if (!dsn || !raw) return { sent: false as const, reason: "not_configured" };
  const key = (input.fingerprint || [input.source, input.name, input.message, input.route || ""]).join("|");
  if (!throttle(key)) return { sent: false as const, reason: "throttled" };
  try {
    const event = buildGlitchTipEvent({
      ...input,
      eventId: crypto.randomUUID().replace(/-/g, ""),
      environment: glitchTipEnvironment(),
      release: glitchTipRelease(),
      serverName: `${process.env.APP_ROLE || "all"}@${os.hostname()}`,
    });
    const response = await fetch(dsn.envelopeUrl, {
      method: "POST",
      headers: { "content-type": "application/x-sentry-envelope", "x-sentry-auth": glitchTipAuthHeader(dsn) },
      body: buildEnvelope(event, raw),
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    return response.ok ? { sent: true as const, eventId: event.event_id } : { sent: false as const, reason: `http_${response.status}` };
  } catch (error) {
    return { sent: false as const, reason: error instanceof Error ? error.name : "failed" };
  }
}

/** Fire-and-forget helper for code paths that must not wait. */
export function reportErrorToGlitchTip(error: unknown, context: { source: GlitchTipEventInput["source"]; route?: string | null; method?: string | null; tags?: GlitchTipEventInput["tags"]; level?: GlitchTipEventInput["level"] }) {
  if (!glitchTipConfigured()) return;
  const source = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown error");
  void reportToGlitchTip({
    name: source.name || "Error",
    message: source.message || "Error",
    stack: source.stack ? source.stack.replaceAll(process.cwd(), "<app>") : null,
    ...context,
  });
}
