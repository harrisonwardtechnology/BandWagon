// Pure rules for organization branding. No imports so it can be unit tested.
//
// Orgs can change how their community looks. They cannot remove the
// independent-platform notice or the BandWagon / Harrison Ward Technology
// attribution (docs/BRANDING.md), so those are simply not editable fields.

export const BRANDING_LIMITS = { displayName: 80, communityName: 80, tagline: 120, welcomeText: 600, logoUrl: 500 };
export const DEFAULT_ACCENT = "#f5a800"; // BandWagon gold
export const DEFAULT_TAGLINE = "Hop on the BandWagon.";

export type OrganizationBranding = {
  communityName?: string;
  tagline?: string;
  welcomeText?: string;
  logoUrl?: string;
  accentColor?: string;
};

function cleanText(value: unknown, max: number) {
  // Strip control characters, collapse runs of spaces, trim.
  const text = String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/[ \t]+/g, " ").trim();
  return { text, tooLong: text.length > max };
}

/** Accepts https URLs only: no javascript:, data:, credentials, or single-label hosts. */
export function safeLogoUrl(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) return null;
  if (raw.length > BRANDING_LIMITS.logoUrl) return null;
  return url.toString();
}

function channel(hex: string) {
  const c = parseInt(hex, 16) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string) {
  const h = hex.replace("#", "");
  return 0.2126 * channel(h.slice(0, 2)) + 0.7152 * channel(h.slice(2, 4)) + 0.0722 * channel(h.slice(4, 6));
}

export function contrastRatio(a: string, b: string) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Buttons use the accent as background with dark navy text (like the default
 * gold). Require WCAG AA (4.5:1) for that pair so buttons stay readable.
 */
export const BUTTON_TEXT_COLOR = "#071a33";
export function accentColorError(value: string) {
  if (!/^#[0-9a-f]{6}$/i.test(value)) return "Pick a color like #F5A800";
  if (contrastRatio(value, BUTTON_TEXT_COLOR) < 4.5) return "That color is too dark for button text to stay readable. Pick a lighter color.";
  return null;
}

export function validateBranding(input: Record<string, unknown>) {
  const errors: Record<string, string> = {};
  const out: OrganizationBranding & { displayName?: string } = {};

  const displayName = cleanText(input.displayName, BRANDING_LIMITS.displayName);
  if (!displayName.text) errors.displayName = "Enter your community's name";
  else if (displayName.tooLong) errors.displayName = `Keep it under ${BRANDING_LIMITS.displayName} characters`;
  else out.displayName = displayName.text;

  for (const key of ["communityName", "tagline", "welcomeText"] as const) {
    const value = cleanText(input[key], BRANDING_LIMITS[key]);
    if (value.tooLong) errors[key] = `Keep it under ${BRANDING_LIMITS[key]} characters`;
    else if (value.text) out[key] = value.text;
  }

  const logoRaw = String(input.logoUrl ?? "").trim();
  if (logoRaw) {
    const logo = safeLogoUrl(logoRaw);
    if (!logo) errors.logoUrl = "Use a secure https:// link to an image";
    else out.logoUrl = logo;
  }

  const accentRaw = String(input.accentColor ?? "").trim();
  if (accentRaw) {
    const accent = accentRaw.toLowerCase();
    const error = accentColorError(accent);
    if (error) errors.accentColor = error;
    else out.accentColor = accent;
  }

  return { value: out, errors, ok: Object.keys(errors).length === 0 };
}

/** What the tenant homepage renders, with safe defaults for anything unset or invalid. */
export function resolveBranding(input: { displayName?: string | null; name?: string | null; branding?: unknown }) {
  const b = (input.branding && typeof input.branding === "object" ? input.branding : {}) as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const accent = typeof b.accentColor === "string" && !accentColorError(b.accentColor.toLowerCase()) ? b.accentColor.toLowerCase() : DEFAULT_ACCENT;
  return {
    name: text(input.displayName, BRANDING_LIMITS.displayName) || text(input.name, BRANDING_LIMITS.displayName) || "BandWagon",
    communityName: text(b.communityName, BRANDING_LIMITS.communityName),
    tagline: text(b.tagline, BRANDING_LIMITS.tagline) || DEFAULT_TAGLINE,
    welcomeText: text(b.welcomeText, BRANDING_LIMITS.welcomeText),
    logoUrl: safeLogoUrl(b.logoUrl),
    accentColor: accent,
  };
}
