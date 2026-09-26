import { NextResponse } from "next/server";
import { requireSessionIdentity } from "@/lib/auth";
import { getAnyVerifiedPhone, getSmsConsentStatus, recordSmsConsent } from "@/lib/sms-consent";
import { SMS_CONSENT_TEXT } from "@/lib/sms-consent-policy";

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
    await recordSmsConsent({ phone, action: body.optIn ? "opt_in" : "opt_out", source: "settings", personId: identity.personId });
    return NextResponse.json({ ok: true, ...(await getSmsConsentStatus(identity.personId)) }, { headers: privateHeaders });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update text message settings" }, { status: 400, headers: privateHeaders });
  }
}
