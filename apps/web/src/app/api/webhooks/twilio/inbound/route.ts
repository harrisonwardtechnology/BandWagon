import { emptyTwiml, escapeXml, markOnce, parseTwilioForm, setSmsConsent, twiml, validateTwilioSignature } from "@/lib/twilio";
import { confirmOrganizationDecommissionFromMessage } from "@/lib/organization-decommission-sms";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await parseTwilioForm(request);
  if (!validateTwilioSignature(request, form)) {
    return new Response("Invalid Twilio signature", { status: 403 });
  }

  const sid = form.MessageSid || form.SmsSid || `${form.From}:${form.To}:${form.Body}`;
  if (!(await markOnce(`inbound:${sid}`))) return emptyTwiml();

  // With Twilio Advanced Opt-Out enabled, Twilio supplies OptOutType and handles
  // the carrier-facing STOP/START/HELP reply. We only mirror consent state here.
  const optOutType = (form.OptOutType || "").toUpperCase();
  if (optOutType === "STOP") await setSmsConsent(form.From, "opted_out");
  if (optOutType === "START") await setSmsConsent(form.From, "opted_in");

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
