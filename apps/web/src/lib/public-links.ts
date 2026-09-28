// Public links and environment labels shown in the UI. No imports, so tests
// can load this file directly.
//
// NEXT_PUBLIC_* values are inlined by Next.js at build time. Set them as
// build variables in Coolify (and as build args for docker compose builds).

// Shared mailboxes on the bandwagon.club M365 domain.
export const SUPPORT_EMAIL_FALLBACK = "support@bandwagon.club";
export const PRIVACY_EMAIL_FALLBACK = "privacy@bandwagon.club";
export const SECURITY_EMAIL_FALLBACK = "security@bandwagon.club";
export const SPONSORS_EMAIL_FALLBACK = "sponsors@bandwagon.club";

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

export const STATUS_PAGE_FALLBACK = "https://status.bandwagon.club/";

/** Public status page (Uptime Kuma). Falls back to status.bandwagon.club when not configured. */
export function statusPageUrl() {
  return safePublicUrl(process.env.NEXT_PUBLIC_STATUS_PAGE_URL) || safePublicUrl(process.env.NEXT_PUBLIC_STATUS_URL) || STATUS_PAGE_FALLBACK;
}

export function publicEnvironment() {
  return String(process.env.NEXT_PUBLIC_ENVIRONMENT || "production").trim().toLowerCase();
}

export function isStagingEnvironment() {
  return publicEnvironment() === "staging";
}
