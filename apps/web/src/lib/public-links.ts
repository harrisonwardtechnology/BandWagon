// Public links and environment labels shown in the UI. No imports, so tests
// can load this file directly.
//
// NEXT_PUBLIC_* values are inlined by Next.js at build time. Set them as
// build variables in Coolify (and as build args for docker compose builds).

export const SUPPORT_EMAIL_FALLBACK = "help+support@harrisonward.com";
export const PRIVACY_EMAIL_FALLBACK = "help+privacy@harrisonward.com";

/** Accept only absolute http(s) URLs; anything else is treated as unset. */
export function safePublicUrl(value: string | undefined | null) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Public help desk (for example a FreeScout portal). Null when not configured. */
export function helpDeskUrl() {
  return safePublicUrl(process.env.NEXT_PUBLIC_HELP_DESK_URL);
}

/** Public status page (for example an Uptime Kuma status page). Null when not configured. */
export function statusPageUrl() {
  return safePublicUrl(process.env.NEXT_PUBLIC_STATUS_PAGE_URL) || safePublicUrl(process.env.NEXT_PUBLIC_STATUS_URL);
}

export function publicEnvironment() {
  return String(process.env.NEXT_PUBLIC_ENVIRONMENT || "production").trim().toLowerCase();
}

export function isStagingEnvironment() {
  return publicEnvironment() === "staging";
}
