export const PRIVACY_CONSENT_VERSION = "2026-08-26";
export const PRIVACY_CONSENT_COOKIE = "bw_privacy_preferences";
export const PRIVACY_CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
export const PRIVACY_CONSENT_EVENT = "bandwagon:privacy-consent-changed";
export const OPEN_PRIVACY_PREFERENCES_EVENT = "bandwagon:open-privacy-preferences";

export type PrivacyPreferences = {
  version: string;
  functional: boolean;
  decidedAt: string;
};

export function createPrivacyPreferences(functional: boolean, decidedAt = new Date()): PrivacyPreferences {
  return {
    version: PRIVACY_CONSENT_VERSION,
    functional,
    decidedAt: decidedAt.toISOString(),
  };
}

export function serializePrivacyPreferences(preferences: PrivacyPreferences) {
  const value = new URLSearchParams({
    v: preferences.version,
    f: preferences.functional ? "1" : "0",
    t: preferences.decidedAt,
  });
  return value.toString();
}

export function parsePrivacyPreferences(value: string | null | undefined): PrivacyPreferences | null {
  if (!value) return null;
  try {
    const parsed = new URLSearchParams(decodeURIComponent(value));
    const version = parsed.get("v");
    const functional = parsed.get("f");
    const decidedAt = parsed.get("t");
    if (version !== PRIVACY_CONSENT_VERSION || !["0", "1"].includes(functional || "") || !decidedAt) return null;
    if (Number.isNaN(Date.parse(decidedAt))) return null;
    return { version, functional: functional === "1", decidedAt };
  } catch {
    return null;
  }
}

export function privacyPreferencesFromCookieHeader(cookieHeader: string | null | undefined) {
  if (!cookieHeader) return null;
  const prefix = `${PRIVACY_CONSENT_COOKIE}=`;
  const value = cookieHeader.split(";").map(part => part.trim()).find(part => part.startsWith(prefix))?.slice(prefix.length);
  return parsePrivacyPreferences(value);
}
