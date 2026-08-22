import { markOnce, parseTwilioForm, validateTwilioSignature } from "@/lib/twilio";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await parseTwilioForm(request);
  if (!validateTwilioSignature(request, form)) {
    return new Response("Invalid Twilio signature", { status: 403 });
  }

  const key = `${form.CallSid || "unknown"}:${form.CallStatus || "unknown"}`;
  if (!(await markOnce(`voice-status:${key}`, 604800))) {
    return new Response(null, { status: 204 });
  }

  console.info("Twilio voice status", {
    callSid: form.CallSid,
    status: form.CallStatus,
    duration: form.CallDuration || null,
    from: form.From || null,
    to: form.To || null,
  });

  return new Response(null, { status: 204 });
}
