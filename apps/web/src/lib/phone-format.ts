import { AsYouType, getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";

export const DEFAULT_PHONE_COUNTRY: CountryCode = "US";

export function normalizePhoneInput(value: string, defaultCountry: CountryCode = DEFAULT_PHONE_COUNTRY) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = parsePhoneNumberFromString(raw, defaultCountry);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

export function requireNormalizedPhone(value: string, defaultCountry: CountryCode = DEFAULT_PHONE_COUNTRY) {
  const normalized = normalizePhoneInput(value, defaultCountry);
  if (!normalized) throw new Error("Enter a valid mobile number");
  return normalized;
}

export function formatPhoneAsYouType(value: string, country: CountryCode = DEFAULT_PHONE_COUNTRY) {
  const raw = String(value || "");
  if (!raw) return "";
  try { return new AsYouType(country).input(raw); } catch { return raw; }
}

export function formatPhoneForDisplay(value: string, defaultCountry: CountryCode = DEFAULT_PHONE_COUNTRY) {
  const parsed = parsePhoneNumberFromString(String(value || ""), defaultCountry);
  if (!parsed) return String(value || "");
  return parsed.country === defaultCountry ? parsed.formatNational() : parsed.formatInternational();
}

export function phoneCountry(value: string, fallback: CountryCode = DEFAULT_PHONE_COUNTRY): CountryCode {
  const parsed = parsePhoneNumberFromString(String(value || ""), fallback);
  return (parsed?.country || fallback) as CountryCode;
}

export function countryFlag(country: CountryCode) {
  return country.toUpperCase().replace(/./g, char => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

export function phoneCountries() {
  const displayNames = typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;
  return getCountries().map(country => ({
    country,
    name: displayNames?.of(country) || country,
    callingCode: `+${getCountryCallingCode(country)}`,
  })).sort((a,b) => a.name.localeCompare(b.name));
}
