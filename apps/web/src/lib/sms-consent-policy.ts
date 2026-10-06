// Pure SMS consent rules. No imports so it can be unit tested directly.

// The exact wording shown next to every SMS opt-in checkbox. It is stored
// with each consent record, so change CONSENT_TEXT_VERSION when it changes.
export const SMS_CONSENT_TEXT =
  "I agree to receive transactional SMS messages from BandWagon, a Harrison Ward Technology product, about ride requests, ride offers, confirmations, schedule changes, reminders, driver alerts, pickup/drop-off status, cancellations, and ride coordination. Sign-in codes are separate and do not need this box. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help.";
export const SMS_CONSENT_TEXT_VERSION = "2026-09-30";

// Carrier rule: a one-time sign-in code request is its own consent, separate from ride texts.
// Shown directly under the Send Sign-In Code button when the person picks Mobile Phone.
export const OTP_SEND_BUTTON_LABEL = "Send Sign-In Code";
export const SMS_OTP_DISCLOSURE_TEXT =
  "By clicking Send Sign-In Code, you agree to receive a one-time verification passcode via text message from BandWagon. Message and data rates may apply.";

// Sent once, right after someone opts in (checkbox or settings). Carriers
// require brand, frequency, rates, HELP/STOP and a support contact.
export const SMS_WELCOME_TEXT =
  "BandWagon: You're signed up for ride texts (offers, confirmations, reminders, pickup updates). Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to opt out. Support: support@bandwagon.club";

// Reply for the HELP keyword. Paste into Twilio Advanced Opt-Out as the HELP message.
export const SMS_HELP_TEXT =
  "BandWagon ride texts: help at https://bandwagon.club/help or support@bandwagon.club. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out.";

export type SmsConsentState = "opted_in" | "opted_out" | "not_configured";
export type SmsConsentAction = "opt_in" | "opt_out";
export type SmsConsentSource =
  | "signup_checkbox"
  | "settings"
  | "carrier_keyword"
  | "twilio_advanced_opt_out";

/**
 * A registry row that says opted out came either from the person's own settings
 * page ("settings") or from the carrier side: a STOP keyword, Twilio Advanced
 * Opt-Out, or a STOP carried over by migration 053. After a carrier-side STOP,
 * Twilio keeps blocking the number until the person texts START, whatever the
 * app records. Only "settings" opt-outs are ours to undo from the web.
 */
export function isCarrierStop(input: { registryState?: string | null; registrySource?: string | null }) {
  return input.registryState === "opted_out" && input.registrySource !== "settings";
}

/** True when a web opt-in (checkbox or settings) must not go ahead because a carrier STOP is still in force. */
export function webOptInBlockedByCarrierStop(input: {
  action: SmsConsentAction;
  source: SmsConsentSource;
  registryState?: string | null;
  registrySource?: string | null;
}) {
  const fromWeb = input.source === "signup_checkbox" || input.source === "settings";
  return input.action === "opt_in" && fromWeb && isCarrierStop(input);
}

/** What to tell someone who tries to opt in on the web while a carrier STOP is in force. */
export function smsCarrierStopMessage(displayNumber?: string | null) {
  const how = displayNumber
    ? `Text START to ${displayNumber} to turn them back on.`
    : "Reply START to any BandWagon text to turn them back on.";
  return `Texts to this number are still blocked because it replied STOP. ${how} Then refresh this page.`;
}

/**
 * The one rule for "which phone row counts" when more than one could match:
 * newest verification first, then newest row, then id so the order is stable.
 * Callers still add their own "verified_at is not null" filter. Used by the
 * send path, the settings status, and the router's phone lookup, so they can
 * never disagree about which row they mean.
 */
export function verifiedPhoneOrderBy(alias = "") {
  if (alias && !/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error("Invalid SQL alias");
  const p = alias ? `${alias}.` : "";
  return `${p}verified_at desc, ${p}created_at desc, ${p}id desc`;
}

// Twilio's default opt-out / opt-in keyword sets (case-insensitive, whole message).
const OPT_OUT_KEYWORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"]);
const OPT_IN_KEYWORDS = new Set(["START", "YES", "UNSTOP"]);

/**
 * Decide what an inbound message means for consent. Twilio Advanced Opt-Out
 * sends OptOutType; when it is missing we fall back to the keyword itself so
 * a STOP is never dropped because a console setting changed.
 */
export function classifyInboundConsent(input: { optOutType?: string | null; body?: string | null }): SmsConsentAction | null {
  const type = String(input.optOutType || "").trim().toUpperCase();
  if (type === "STOP") return "opt_out";
  if (type === "START") return "opt_in";
  if (type) return null; // HELP or another Twilio-handled type
  const word = String(input.body || "").trim().toUpperCase().replace(/[.!\s]+$/g, "");
  if (OPT_OUT_KEYWORDS.has(word)) return "opt_out";
  if (OPT_IN_KEYWORDS.has(word)) return "opt_in";
  return null;
}

/**
 * Whether a text may be sent. Verification codes the person just asked for
 * only need "not opted out". Everything else needs an affirmative opt-in on
 * the verified phone and no newer carrier-level opt-out for the number.
 */
export function mobileSendDecision(input: {
  notificationType: string;
  phoneState?: SmsConsentState | null;
  registryState?: "opted_in" | "opted_out" | null;
}): { allowed: true } | { allowed: false; reason: string } {
  if (input.registryState === "opted_out" || input.phoneState === "opted_out") {
    return { allowed: false, reason: "Recipient has opted out of mobile messaging" };
  }
  if (input.notificationType === "otp") return { allowed: true };
  if (input.phoneState !== "opted_in") {
    return { allowed: false, reason: "Recipient has not opted in to text messages" };
  }
  return { allowed: true };
}
