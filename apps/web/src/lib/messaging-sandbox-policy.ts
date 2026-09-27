// Messaging sandbox policy. Pure functions only (no imports) so it can be unit
// tested with node --test and shared by the SMS and email send paths.
//
// When the sandbox is on, SMS/RCS and email go only to allowlisted recipients.
// Everyone else is recorded as skipped and nothing reaches the provider.
// Staging always runs in sandbox mode, even if MESSAGING_SANDBOX is unset or
// set to "false", so a copied environment cannot message real families.

export type SandboxChannel = "sms" | "email";

export type SandboxDecision =
  | { sandbox: false; send: true }
  | { sandbox: true; send: true }
  | { sandbox: true; send: false; reason: string };

export const SANDBOX_SKIPPED_STATUS = "sandbox_skipped";

type SandboxEnv = {
  [key: string]: string | undefined;
  MESSAGING_SANDBOX?: string;
  NEXT_PUBLIC_ENVIRONMENT?: string;
  APP_ENVIRONMENT?: string;
  SANDBOX_ALLOWED_PHONES?: string;
  SANDBOX_ALLOWED_EMAILS?: string;
};

function isStaging(value: string | undefined) {
  return String(value || "").trim().toLowerCase() === "staging";
}

export function isMessagingSandboxEnabled(env: SandboxEnv) {
  if (isStaging(env.NEXT_PUBLIC_ENVIRONMENT) || isStaging(env.APP_ENVIRONMENT)) return true;
  return ["true", "1", "yes", "on"].includes(String(env.MESSAGING_SANDBOX || "").trim().toLowerCase());
}

export function normalizeSandboxPhone(value: string) {
  const cleaned = String(value || "").trim().replace(/[\s().-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(cleaned) ? cleaned : null;
}

export function normalizeSandboxEmail(value: string) {
  const cleaned = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned) ? cleaned : null;
}

export function parseSandboxAllowlist(value: string | undefined, channel: SandboxChannel) {
  const normalize = channel === "sms" ? normalizeSandboxPhone : normalizeSandboxEmail;
  const entries = String(value || "")
    .split(/[,;\n]/)
    .map((entry) => normalize(entry))
    .filter((entry): entry is string => Boolean(entry));
  return new Set(entries);
}

export function sandboxDeliveryDecision(input: { channel: SandboxChannel; to: string; env: SandboxEnv }): SandboxDecision {
  if (!isMessagingSandboxEnabled(input.env)) return { sandbox: false, send: true };
  const allowlist = parseSandboxAllowlist(
    input.channel === "sms" ? input.env.SANDBOX_ALLOWED_PHONES : input.env.SANDBOX_ALLOWED_EMAILS,
    input.channel
  );
  const recipient = input.channel === "sms" ? normalizeSandboxPhone(input.to) : normalizeSandboxEmail(input.to);
  if (recipient && allowlist.has(recipient)) return { sandbox: true, send: true };
  return {
    sandbox: true,
    send: false,
    reason:
      input.channel === "sms"
        ? "Messaging sandbox: phone is not in SANDBOX_ALLOWED_PHONES"
        : "Messaging sandbox: email is not in SANDBOX_ALLOWED_EMAILS",
  };
}
