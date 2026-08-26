"use client";

import { useEffect, useMemo, useState } from "react";
import {
  countryFlag,
  DEFAULT_PHONE_COUNTRY,
  formatPhoneAsYouType,
  formatPhoneForDisplay,
  normalizePhoneInput,
  phoneCountries,
  phoneCountry,
} from "@/lib/phone-format";
import type { CountryCode } from "libphonenumber-js/min";

type PhoneNumberInputProps = {
  id?: string;
  value: string;
  onChange: (e164: string) => void;
  defaultCountry?: CountryCode;
  required?: boolean;
  disabled?: boolean;
  autoComplete?: string;
  "aria-label"?: string;
};

const preferredCountries: CountryCode[] = ["US", "CA", "GB", "AU", "MX"];

function nationalPlaceholder(country: CountryCode) {
  const examples: Partial<Record<CountryCode,string>> = {
    US: "(201) 555-0123",
    CA: "(416) 555-0123",
    GB: "07400 123456",
    AU: "0412 345 678",
    MX: "55 1234 5678",
  };
  return examples[country] || "Mobile number";
}

export default function PhoneNumberInput({
  id,
  value,
  onChange,
  defaultCountry = DEFAULT_PHONE_COUNTRY,
  required = false,
  disabled = false,
  autoComplete = "tel",
  "aria-label": ariaLabel = "Mobile phone number",
}: PhoneNumberInputProps) {
  const initialCountry = value ? phoneCountry(value, defaultCountry) : defaultCountry;
  const [country, setCountry] = useState<CountryCode>(initialCountry);
  const [display, setDisplay] = useState(value ? formatPhoneForDisplay(value, initialCountry) : "");
  const [touched, setTouched] = useState(false);
  const countries = useMemo(() => {
    const rows = phoneCountries();
    return [...rows].sort((a,b) => {
      const ai = preferredCountries.indexOf(a.country);
      const bi = preferredCountries.indexOf(b.country);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return a.name.localeCompare(b.name);
    });
  }, []);
  const selected = countries.find(item => item.country === country);
  const valid = !display || Boolean(normalizePhoneInput(display, country));

  useEffect(() => {
    if (!value) return;
    const nextCountry = phoneCountry(value, country);
    setCountry(nextCountry);
    setDisplay(formatPhoneForDisplay(value, nextCountry));
  }, [value]);

  function update(raw: string) {
    let nextCountry = country;
    if (raw.trim().startsWith("+")) {
      nextCountry = phoneCountry(raw, country);
      setCountry(nextCountry);
    }
    const formatted = formatPhoneAsYouType(raw, nextCountry);
    setDisplay(formatted);
    onChange(normalizePhoneInput(formatted, nextCountry) || "");
  }

  function changeCountry(next: CountryCode) {
    setCountry(next);
    setDisplay("");
    setTouched(false);
    onChange("");
  }

  return <div className="phone-field">
    <div className={`phone-input-shell${touched && !valid ? " phone-input-invalid" : ""}`}>
      <div className="phone-country-picker" title={`${selected?.name || country} ${selected?.callingCode || ""}`}>
        <span aria-hidden="true">{countryFlag(country)}</span>
        <span className="phone-country-chevron" aria-hidden="true">⌄</span>
        <select value={country} onChange={event => changeCountry(event.target.value as CountryCode)} aria-label="Phone country or region" disabled={disabled}>
          {countries.map(item => <option key={item.country} value={item.country}>{countryFlag(item.country)} {item.name} ({item.callingCode})</option>)}
        </select>
      </div>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete={autoComplete}
        value={display}
        onChange={event => update(event.target.value)}
        onBlur={() => setTouched(true)}
        placeholder={nationalPlaceholder(country)}
        aria-label={ariaLabel}
        aria-invalid={touched && !valid}
        required={required}
        disabled={disabled}
      />
    </div>
    <div className={`phone-field-help${touched && !valid ? " phone-field-error" : ""}`} aria-live="polite">
      {touched && !valid ? "Enter a valid mobile number." : `${selected?.name || country} selected. The country code is added automatically.`}
    </div>
  </div>;
}
