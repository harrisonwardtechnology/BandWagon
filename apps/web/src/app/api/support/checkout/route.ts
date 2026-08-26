import crypto from "node:crypto";
import { createSupportCheckout } from "@/lib/stripe-support";
import { getRedis } from "@/lib/redis";

export const runtime = "nodejs";

function clientIp(request:Request){return String(request.headers.get("cf-connecting-ip")||request.headers.get("x-real-ip")||request.headers.get("x-forwarded-for")?.split(",")[0]||"unknown").trim().slice(0,100);}
function privateKey(value:string){const secret=process.env.AUTH_SECRET||process.env.DATA_ENCRYPTION_KEY||"bandwagon-support-checkout-rate-limit";return crypto.createHmac("sha256",secret).update(value).digest("hex").slice(0,32);}
async function checkoutAllowed(request:Request){const redis=getRedis();if(!redis)return true;if(redis.status==="wait")await redis.connect();const key=`support-checkout:ip:${privateKey(clientIp(request))}`,count=await redis.incr(key);if(count===1)await redis.expire(key,3600);return count<=20;}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if(!await checkoutAllowed(request).catch(()=>false))return Response.json({error:"Too many checkout attempts were started recently. Please wait before trying again."},{status:429});

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
