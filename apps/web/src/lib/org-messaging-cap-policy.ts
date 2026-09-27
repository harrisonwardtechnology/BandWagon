// Pure fair-use policy for per-organization texting (SMS/RCS) caps.
// No imports: this file is exercised directly by node --test.
//
// BandWagon is free to organizations. A per-organization monthly cap keeps one
// large organization from running up the shared Twilio bill. Safety-critical
// messages and sign-in codes are never blocked by the cap, but they still
// count toward usage so admins can see the real picture.

export const ORG_TEXTING_LIMIT_ERROR = "Organization monthly texting limit reached";
export const DEFAULT_ORG_MONTHLY_SMS_CAP_CENTS = 2500; // $25.00
export const MAX_ORG_MONTHLY_SMS_CAP_CENTS = 10_000_000; // $100,000 sanity ceiling
export const DEFAULT_ORG_ALERT_THRESHOLD_PERCENT = 80;

export type MobileUrgency = "routine" | "important" | "critical";

/** Parses ORG_DEFAULT_MONTHLY_SMS_CAP_CENTS. Invalid or missing values fall back to $25. */
export function defaultOrgMonthlySmsCapCents(value: unknown) {
  if (value === undefined || value === null || String(value).trim() === "") return DEFAULT_ORG_MONTHLY_SMS_CAP_CENTS;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_ORG_MONTHLY_SMS_CAP_CENTS;
  return Math.min(MAX_ORG_MONTHLY_SMS_CAP_CENTS, Math.round(parsed));
}

/** The org override wins when set; otherwise the platform default applies. */
export function effectiveOrgCapCents(orgCapCents: unknown, platformDefaultCents: number) {
  if (orgCapCents === undefined || orgCapCents === null || orgCapCents === "") return platformDefaultCents;
  const parsed = Number(orgCapCents);
  if (!Number.isFinite(parsed) || parsed < 0) return platformDefaultCents;
  return Math.min(MAX_ORG_MONTHLY_SMS_CAP_CENTS, Math.round(parsed));
}

export function normalizeAlertThresholdPercent(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_ORG_ALERT_THRESHOLD_PERCENT;
  return Math.max(1, Math.min(99, Math.round(parsed)));
}

/** Messages that are always allowed over the cap (still counted). */
export function isCapExempt(input: { urgency: MobileUrgency; notificationType: string }) {
  return input.urgency === "critical" || input.notificationType === "otp";
}

export type OrgCapDecision = {
  allowed: boolean;
  capped: boolean; // false when the message has no organization
  exempt: boolean;
  overCap: boolean; // true when this message would push usage past the cap
  usedCents: number;
  capCents: number;
  projectedCents: number;
  reason: string | null;
};

/**
 * Decide whether a mobile message may be reserved.
 * - No organization: not org-capped (platform budget and per-recipient limits still apply).
 * - Within cap: allowed.
 * - Over cap: routine and important are blocked; critical urgency and OTP are always allowed.
 */
export function decideOrgMobileCap(input: {
  organizationId: string | null | undefined;
  urgency: MobileUrgency;
  notificationType: string;
  usedCents: number;
  requestedCents: number;
  capCents: number;
}): OrgCapDecision {
  const usedCents = Math.max(0, Number(input.usedCents) || 0);
  const requestedCents = Math.max(0, Number(input.requestedCents) || 0);
  const capCents = Math.max(0, Number(input.capCents) || 0);
  const projectedCents = usedCents + requestedCents;
  if (!input.organizationId) {
    return { allowed: true, capped: false, exempt: false, overCap: false, usedCents, capCents, projectedCents, reason: null };
  }
  const exempt = isCapExempt(input);
  const overCap = projectedCents > capCents;
  if (overCap && !exempt) {
    return { allowed: false, capped: true, exempt, overCap, usedCents, capCents, projectedCents, reason: ORG_TEXTING_LIMIT_ERROR };
  }
  return { allowed: true, capped: true, exempt, overCap, usedCents, capCents, projectedCents, reason: null };
}

export function usagePercent(usedCents: number, capCents: number) {
  const used = Math.max(0, Number(usedCents) || 0);
  const cap = Math.max(0, Number(capCents) || 0);
  if (cap <= 0) return used > 0 ? 100 : 0;
  return Math.round((used / cap) * 1000) / 10;
}

/** Thresholds (alert percent and 100) that usage has reached. Each is alerted once per month. */
export function reachedAlertThresholds(input: { usedCents: number; capCents: number; alertThresholdPercent?: number }) {
  const alertAt = normalizeAlertThresholdPercent(input.alertThresholdPercent ?? DEFAULT_ORG_ALERT_THRESHOLD_PERCENT);
  const used = Math.max(0, Number(input.usedCents) || 0);
  const cap = Math.max(0, Number(input.capCents) || 0);
  // Compare exact values (not the rounded display percent) so 79.96% is not treated as 80%.
  if (cap <= 0) return used > 0 ? [alertAt, 100] : [];
  return [alertAt, 100].filter((threshold) => used * 100 >= threshold * cap);
}

/** Calendar month window in UTC. `monthKey` is the first day, YYYY-MM-DD. */
export function utcMonthWindow(now: Date = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end, monthKey: start.toISOString().slice(0, 10) };
}
