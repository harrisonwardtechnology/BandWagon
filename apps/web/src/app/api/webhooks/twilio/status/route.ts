import { markOnce, parseTwilioForm, validateTwilioSignature } from "@/lib/twilio";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await parseTwilioForm(request);
  if (!validateTwilioSignature(request, form)) {
    return new Response("Invalid Twilio signature", { status: 403 });
  }

  const key = `${form.MessageSid || "unknown"}:${form.MessageStatus || form.SmsStatus || "unknown"}`;
  if (!(await markOnce(`message-status:${key}`, 604800))) {
    return new Response(null, { status: 204 });
  }

  console.info("Twilio message status", {
    messageSid: form.MessageSid,
    status: form.MessageStatus || form.SmsStatus,
    errorCode: form.ErrorCode || null,
    to: form.To || null,
  });

  return new Response(null, { status: 204 });
}
