// Pure sponsor validation. No imports: exercised directly by node --test.
//
// Core Funding Boundary (docs/ORGANIZATION-REVIEW-GUIDE.md): sponsors receive
// adult-facing recognition only. They never receive participant data, never
// get matching priority, and never get targeted advertising. Nothing in the
// sponsor record links to riders, drivers, families, or rides.

export const SPONSOR_LIMITS = { name: 120, url: 500, tier: 40, notes: 2000 } as const;
export const SUGGESTED_SPONSOR_TIERS = ["Gold", "Silver", "Bronze", "Community"] as const;

function cleanText(value: unknown, max: number) {
  const text = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return text.slice(0, max);
}

/**
 * Returns a normalized https URL, or null when the value is empty.
 * Throws for anything that is not a plain https URL (javascript:, data:,
 * http:, embedded credentials, or overly long values).
 */
export function normalizeHttpsUrl(value: unknown, field = "URL"): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.length > SPONSOR_LIMITS.url) throw new Error(`${field} must be ${SPONSOR_LIMITS.url} characters or fewer`);
  if (/[\s<>"'`\\]/.test(raw)) throw new Error(`${field} contains characters that are not allowed`);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${field} must be a full https:// address`);
  }
  if (parsed.protocol !== "https:") throw new Error(`${field} must start with https://`);
  if (parsed.username || parsed.password) throw new Error(`${field} must not include a username or password`);
  if (!parsed.hostname || !parsed.hostname.includes(".")) throw new Error(`${field} must include a real domain name`);
  return parsed.toString();
}

/** Lenient variant for untrusted sources (like Stripe metadata): invalid URLs become null. */
export function safeHttpsUrlOrNull(value: unknown) {
  try {
    return normalizeHttpsUrl(value);
  } catch {
    return null;
  }
}

function parseDate(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error(`${field} is not a valid date`);
  return date;
}

export type SponsorInput = {
  sponsorName: string;
  sponsorWebsite: string | null;
  logoUrl: string | null;
  tierLabel: string | null;
  publicDisplay: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  internalNotes: string | null;
};

export function validateSponsorInput(body: Record<string, unknown>): SponsorInput {
  const sponsorName = cleanText(body.sponsorName, SPONSOR_LIMITS.name + 1);
  if (!sponsorName) throw new Error("Sponsor name is required");
  if (sponsorName.length > SPONSOR_LIMITS.name) throw new Error(`Sponsor name must be ${SPONSOR_LIMITS.name} characters or fewer`);
  const tier = cleanText(body.tierLabel, SPONSOR_LIMITS.tier + 1);
  if (tier.length > SPONSOR_LIMITS.tier) throw new Error(`Tier label must be ${SPONSOR_LIMITS.tier} characters or fewer`);
  const notesRaw = String(body.internalNotes ?? "").trim();
  if (notesRaw.length > SPONSOR_LIMITS.notes) throw new Error(`Internal notes must be ${SPONSOR_LIMITS.notes} characters or fewer`);
  const startsAt = parseDate(body.startsAt, "Start date");
  const endsAt = parseDate(body.endsAt, "End date");
  if (startsAt && endsAt && endsAt.getTime() < startsAt.getTime()) throw new Error("End date must be on or after the start date");
  return {
    sponsorName,
    sponsorWebsite: normalizeHttpsUrl(body.sponsorWebsite, "Website"),
    logoUrl: normalizeHttpsUrl(body.logoUrl, "Logo URL"),
    tierLabel: tier || null,
    publicDisplay: body.publicDisplay === true || body.publicDisplay === "true",
    startsAt,
    endsAt,
    internalNotes: notesRaw || null,
  };
}

/** Whether a sponsor row should appear on public pages right now. */
export function isPubliclyVisibleSponsor(row: { status?: string | null; public_display?: boolean | null; starts_at?: string | Date | null; ends_at?: string | Date | null }, now: Date = new Date()) {
  if (row.status !== "active" || !row.public_display) return false;
  if (row.starts_at && new Date(row.starts_at).getTime() > now.getTime()) return false;
  if (row.ends_at && new Date(row.ends_at).getTime() <= now.getTime()) return false;
  return true;
}
