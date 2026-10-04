export const MOBILE_NOTIFICATION_TYPES = [
  "new_ride_available",
  "driver_offer",
  "ride_matched",
  "reminder_24h",
  "reminder_1h",
  "driver_arriving",
  "last_minute_cancellation",
  "pickup_changed",
  "ride_no_show",
  "safety_alert",
  "credential_expiring",
  "organization_removed",
  "organization_decommission_confirmation",
  "otp",
  "platform_test",
  "waitlist_offer",
  "waitlist_update",
  "sms_welcome",
] as const;

export type MobileNotificationType = typeof MOBILE_NOTIFICATION_TYPES[number];

// Carriers expect the brand name at the start of every text. This is the same
// convention as SMS_WELCOME_TEXT and the START reply ("BandWagon: ...").
export const SMS_BRAND_NAME = "BandWagon";
export const SMS_BRAND_PREFIX = `${SMS_BRAND_NAME}: `;

/**
 * Put the brand in front of a text body. A body that already starts with the
 * brand (for example "BandWagon verification code: 123456") is left alone, so
 * nothing is ever prefixed twice. Used for SMS/RCS only, never push or email.
 */
export function withSmsBrandPrefix(value: string) {
  const body = String(value || "").trim();
  if (!body) return body;
  return /^bandwagon\b/i.test(body) ? body : `${SMS_BRAND_PREFIX}${body}`;
}

const allowedTypes = new Set<string>(MOBILE_NOTIFICATION_TYPES);
const recipientOptionalTypes = new Set<string>(["otp", "platform_test"]);

export function enforceMobileMessageIntent(input: {
  notificationType: string;
  body: string;
  personId?: string | null;
}) {
  if (!allowedTypes.has(input.notificationType)) {
    throw new Error("Mobile messaging is limited to approved BandWagon transactional workflows");
  }
  if (!recipientOptionalTypes.has(input.notificationType) && !input.personId) {
    throw new Error("Transactional mobile messages must be bound to a BandWagon person");
  }

  const body = String(input.body || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
  if (!body || body.length > 600) {
    throw new Error("Transactional message body must be between 1 and 600 characters");
  }
  // The 600 character limit applies to the caller's text. The brand prefix is added on top.
  return { body: withSmsBrandPrefix(body), notificationType: input.notificationType as MobileNotificationType };
}


/**
 * Which channel Twilio really used, read from a status callback. "Auto" sends
 * go through the Messaging Service, which tries RCS and falls back to SMS, so
 * the channel is only known once Twilio reports back. Twilio marks an RCS
 * delivery with ChannelPrefix "rcs" or a From that starts with "rcs:". A plain
 * phone number, short code, or alphanumeric sender in From means SMS.
 * Returns null when the callback does not say, so the log is left as it was.
 */
export function deliveredMobileChannel(input: { from?: string | null; channelPrefix?: string | null }): "sms" | "rcs" | null {
  const prefix = String(input.channelPrefix || "").trim().toLowerCase();
  if (prefix === "rcs") return "rcs";
  if (prefix === "sms" || prefix === "mms") return "sms";
  if (prefix) return null; // another channel (for example whatsapp): not ours to relabel
  const from = String(input.from || "").trim();
  if (!from) return null;
  if (/^rcs:/i.test(from)) return "rcs";
  if (/^[a-z]+:/i.test(from)) return null; // some other channel address
  if (/^\+?\d{3,15}$/.test(from) || /^[A-Za-z0-9 ]{1,11}$/.test(from)) return "sms";
  return null;
}
