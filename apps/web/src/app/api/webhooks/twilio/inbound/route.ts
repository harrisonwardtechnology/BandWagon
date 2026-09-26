import { emptyTwiml, escapeXml, markOnce, mirrorSmsConsentToRedis, parseTwilioForm, twiml, validateTwilioSignature,type TwilioForm } from "@/lib/twilio";
import { recordSmsConsent } from "@/lib/sms-consent";
import { classifyInboundConsent } from "@/lib/sms-consent-policy";
import { confirmOrganizationDecommissionFromMessage } from "@/lib/organization-decommission-sms";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let form:TwilioForm;
  try{form=await parseTwilioForm(request);}catch{return new Response("Webhook payload is too large or invalid",{status:413});}
  if (!validateTwilioSignature(request, form)) {
    return new Response("Invalid Twilio signature", { status: 403 });
  }

  // Consent is recorded before the dedupe marker. Recording is idempotent, and
  // if it fails we return 500 so Twilio retries instead of the retry being
  // swallowed by an already-set dedupe key.
  const consentAction = classifyInboundConsent({ optOutType: form.OptOutType, body: form.Body });
  if (consentAction && form.From) {
    try {
      await recordSmsConsent({
        phone: form.From,
        action: consentAction,
        source: form.OptOutType ? "twilio_advanced_opt_out" : "carrier_keyword",
      });
    } catch (error) {
      console.error("Twilio consent update failed", { messageSid: form.MessageSid, error: error instanceof Error ? error.message : "unknown" });
      return new Response("Consent update failed", { status: 500 });
    }
    await mirrorSmsConsentToRedis(form.From, consentAction === "opt_out" ? "opted_out" : "opted_in");
  }

  const sid = form.MessageSid || form.SmsSid || `${form.From}:${form.To}:${form.Body}`;
  if (!(await markOnce(`inbound:${sid}`))) return emptyTwiml();

  try {
    const decommission = await confirmOrganizationDecommissionFromMessage({ from: form.From || "", body: form.Body || "" });
    if (decommission.matched) {
      return twiml(`<Message>${escapeXml("Organization removal confirmed. BandWagon has started the approved decommission process. If this was unexpected, contact BandWagon Support immediately.")}</Message>`);
    }
  } catch (error) {
    const message=error instanceof Error?error.message:"Unable to confirm organization removal";
    if (/^CONFIRM\s+/i.test(form.Body||"")) return twiml(`<Message>${escapeXml(message)}</Message>`);
  }

  console.info("Twilio inbound message", {
    messageSid: form.MessageSid,
    from: form.From,
    to: form.To,
    optOutType: form.OptOutType || null,
    channel: form.ChannelPrefix || "sms",
  });

  // Never echo arbitrary user message contents or log them.
  return emptyTwiml();
}
