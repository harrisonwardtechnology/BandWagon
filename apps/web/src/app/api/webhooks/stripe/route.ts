import { processStripeEvent, verifyStripeWebhook } from "@/lib/stripe-support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();

  try {
    if (!verifyStripeWebhook(rawBody, request.headers.get("stripe-signature"))) {
      return new Response("Invalid Stripe signature", { status: 400 });
    }

    const event = JSON.parse(rawBody);
    await processStripeEvent(event);
    return Response.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook failed", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    return new Response("Webhook processing failed", { status: 500 });
  }
}
