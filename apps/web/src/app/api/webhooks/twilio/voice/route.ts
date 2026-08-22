import { escapeXml, parseTwilioForm, twiml, validateTwilioSignature } from "@/lib/twilio";

export const runtime = "nodejs";

const GREETING =
  "Thanks for calling BandWagon. This number is used for automated ride coordination and notifications. " +
  "For help, visit bandwagon dot harrisonward dot net, or reply HELP to one of our text messages. " +
  "This number does not accept voice calls. Goodbye.";

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

  // Small lead-in prevents the greeting from sounding clipped when the call connects.
  // Neural Joanna is more natural than the standard Polly voice.
  // The final pause keeps Twilio from hanging up immediately after "Goodbye."
  return twiml(
    `<Pause length="1"/>` +
    `<Say voice="Polly.Joanna-Neural">${escapeXml(GREETING)}</Say>` +
    `<Pause length="2"/>` +
    `<Hangup/>`
  );
}
