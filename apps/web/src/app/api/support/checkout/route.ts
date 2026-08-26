import { createSupportCheckout } from "@/lib/stripe-support";
import { turnstileConfigured, verifyTurnstileToken } from "@/lib/turnstile";
import { getBaseSessionIdentity } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const identity=await getBaseSessionIdentity().catch(()=>null),isPlatformAdmin=Boolean(identity?.platformRole&&["owner","support","finance"].includes(identity.platformRole));
    if(!isPlatformAdmin&&!turnstileConfigured())return Response.json({error:"Checkout is temporarily unavailable"},{status:503});
    if(!isPlatformAdmin&&!await verifyTurnstileToken(request,body.turnstileToken,"support_checkout").catch(()=>false))return Response.json({error:"The security check was unsuccessful. Please try again."},{status:400});

    const type = body.type === "sponsor" ? "sponsor" : "individual";
    const amountCents = Number(body.amountCents);

    if (!Number.isInteger(amountCents) || amountCents < 100 || amountCents > 1000000) {
      return Response.json({ error: "Amount must be between $1 and $10,000." }, { status: 400 });
    }

    const session = await createSupportCheckout({
      organizationId: typeof body.organizationId === "string" ? body.organizationId : null,
      organizationSlug: typeof body.organizationSlug === "string" ? body.organizationSlug : null,
      type,
      amountCents,
      ridePublicRef: typeof body.ridePublicRef === "string" ? body.ridePublicRef : null,
      sponsorName: typeof body.sponsorName === "string" ? body.sponsorName.trim() : null,
      sponsorWebsite: typeof body.sponsorWebsite === "string" ? body.sponsorWebsite.trim() : null,
      sponsorDisplayPublicly: Boolean(body.sponsorDisplayPublicly),
      anonymous: Boolean(body.anonymous),
    });

    return Response.json({ ok: true, checkoutUrl: session.url, sessionId: session.id });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to create Stripe Checkout session" },
      { status: 500 }
    );
  }
}
