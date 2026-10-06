import { markOnce, parseTwilioForm, validateTwilioSignature } from "@/lib/twilio";
import { recordDeliveredChannelFromStatus } from "@/lib/twilio-status";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await parseTwilioForm(request);
  if (!validateTwilioSignature(request, form)) {
    return new Response("Invalid Twilio signature", { status: 403 });
  }

  // Record the real channel (RCS or the SMS fallback) before the dedupe marker.
  // The update is idempotent, and a failure here must never make Twilio retry forever.
  try {
    await recordDeliveredChannelFromStatus(form);
  } catch (error) {
    console.error("Twilio delivered-channel update failed", { messageSid: form.MessageSid, error: error instanceof Error ? error.message : "unknown" });
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
