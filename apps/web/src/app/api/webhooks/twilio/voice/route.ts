import { escapeXml, parseTwilioForm, twiml, validateTwilioSignature } from "@/lib/twilio";

export const runtime = "nodejs";

const GREETING =
  "Thanks for calling BandWagon. This number is used for automated ride coordination and notifications. " +
  "For assistance, please visit bandwagon dot harrisonward dot net, or reply HELP to a text message from us. " +
  "This line does not accept voice calls. Goodbye.";

export async function POST(request: Request) {
  const form = await parseTwilioForm(request);
  if (!validateTwilioSignature(request, form)) {
    return new Response("Invalid Twilio signature", { status: 403 });
  }

  console.info("Twilio inbound voice call", {
    callSid: form.CallSid,
    from: form.From,
    to: form.To,
  });

  return twiml(`<Say voice="Polly.Joanna">${escapeXml(GREETING)}</Say><Hangup/>`);
}
