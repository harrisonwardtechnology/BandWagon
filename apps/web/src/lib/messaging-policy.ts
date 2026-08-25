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
] as const;

export type MobileNotificationType = typeof MOBILE_NOTIFICATION_TYPES[number];

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
  return { body, notificationType: input.notificationType as MobileNotificationType };
}

