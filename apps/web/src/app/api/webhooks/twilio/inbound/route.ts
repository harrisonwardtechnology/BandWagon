import { emptyTwiml, markOnce, parseTwilioForm, setSmsConsent, validateTwilioSignature } from "@/lib/twilio";

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

  console.info("Twilio inbound message", {
    messageSid: form.MessageSid,
    from: form.From,
    to: form.To,
    optOutType: form.OptOutType || null,
    channel: form.ChannelPrefix || "sms",
  });

  // Do not echo user message contents into logs. Future BandWagon ride commands
  // can be dispatched here after identity/authorization rules are implemented.
  return emptyTwiml();
}
