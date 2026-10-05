import { NextResponse } from "next/server";
import { requireSessionIdentity } from "@/lib/auth";
import { getAnyVerifiedPhone, getSmsConsentStatus, recordSmsConsent, sendSmsWelcome } from "@/lib/sms-consent";
import { SMS_CONSENT_TEXT, smsCarrierStopMessage } from "@/lib/sms-consent-policy";
import { formatPhoneForDisplay } from "@/lib/phone-format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateHeaders = { "cache-control": "no-store, private" };

export async function GET() {
  try {
    const identity = await requireSessionIdentity();
    return NextResponse.json({ ok: true, consentText: SMS_CONSENT_TEXT, ...(await getSmsConsentStatus(identity.personId)) }, { headers: privateHeaders });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load text message settings" }, { status: 400, headers: privateHeaders });
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireSessionIdentity();
    // Consent must come from the person, never from a support operator acting as them.
    if (identity.supportMode) throw new Error("Text message consent can only be changed by the account owner");
    const body = await request.json().catch(() => ({}));
    if (typeof body.optIn !== "boolean") throw new Error("optIn must be true or false");
    const phone = await getAnyVerifiedPhone(identity.personId);
    if (!phone) throw new Error("Add and verify a mobile number first");
    const consent = await recordSmsConsent({ phone, action: body.optIn ? "opt_in" : "opt_out", source: "settings", personId: identity.personId });
    if (consent.carrierStop) {
      // The number replied STOP, so Twilio blocks it until it texts START. Nothing
      // was changed and no welcome text is sent. Say plainly what to do next.
      const sender = process.env.TWILIO_PHONE_NUMBER ? formatPhoneForDisplay(process.env.TWILIO_PHONE_NUMBER) : null;
      return NextResponse.json(
        { error: smsCarrierStopMessage(sender), ...(await getSmsConsentStatus(identity.personId)), carrierStop: true },
        { status: 409, headers: privateHeaders }
      );
    }
    if (consent.newlyOptedIn) void sendSmsWelcome({ phone: consent.phone, personId: identity.personId });
    return NextResponse.json({ ok: true, ...(await getSmsConsentStatus(identity.personId)) }, { headers: privateHeaders });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update text message settings" }, { status: 400, headers: privateHeaders });
  }
}
