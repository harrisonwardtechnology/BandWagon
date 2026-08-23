import crypto from "node:crypto";
import { getDb } from "@/lib/db";

function stripeSecret() {
  const value = process.env.STRIPE_SECRET_KEY;
  if (!value) throw new Error("STRIPE_SECRET_KEY is not configured");
  return value;
}

export async function stripePost(path: string, params: URLSearchParams) {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${stripeSecret()}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
    cache: "no-store",
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error?.message || "Stripe request failed");
  }
  return body;
}

export async function createSupportCheckout(input: {
  organizationId?: string | null;
  organizationSlug?: string | null;
  type: "individual" | "sponsor";
  amountCents: number;
  ridePublicRef?: string | null;
  sponsorName?: string | null;
  sponsorWebsite?: string | null;
  sponsorDisplayPublicly?: boolean;
  anonymous?: boolean;
}) {
  if (input.amountCents < 100) throw new Error("Minimum contribution is $1.00");

  const appUrl = (process.env.APP_URL || "https://bandwagon.harrisonward.net").replace(/\/$/, "");
  const params = new URLSearchParams();

  params.set("mode", "payment");
  params.set("success_url", `${appUrl}/support?success=1&session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", `${appUrl}/support?cancelled=1`);
  params.set("submit_type", input.type === "sponsor" ? "donate" : "donate");

  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "usd");
  params.set("line_items[0][price_data][unit_amount]", String(input.amountCents));
  params.set(
    "line_items[0][price_data][product_data][name]",
    input.type === "sponsor" ? "BandWagon Community Sponsorship" : "Support BandWagon"
  );

  params.set(
    "line_items[0][price_data][product_data][description]",
    input.type === "sponsor"
      ? "Support free community ride coordination through BandWagon."
      : "Help keep BandWagon available free to your community."
  );

  params.set("metadata[type]", input.type);
  if (input.organizationId) params.set("metadata[organization_id]", input.organizationId);
  if (input.organizationSlug) params.set("metadata[organization_slug]", input.organizationSlug);
  if (input.ridePublicRef) params.set("metadata[ride_public_ref]", input.ridePublicRef);
  if (input.sponsorName) params.set("metadata[sponsor_name]", input.sponsorName);
  if (input.sponsorWebsite) params.set("metadata[sponsor_website]", input.sponsorWebsite);
  params.set("metadata[sponsor_display_publicly]", input.sponsorDisplayPublicly ? "true" : "false");
  params.set("metadata[anonymous]", input.anonymous ? "true" : "false");

  const session = await stripePost("/checkout/sessions", params);

  const db = getDb();
  if (!db) throw new Error("Database is not configured");

  await db.query(
    `insert into support_contributions
      (organization_id, contribution_type, amount_cents, stripe_checkout_session_id,
       ride_public_ref, sponsor_name, sponsor_website, sponsor_display_publicly, anonymous, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending')
     on conflict (stripe_checkout_session_id) do nothing`,
    [
      input.organizationId || null,
      input.type,
      input.amountCents,
      session.id,
      input.ridePublicRef || null,
      input.sponsorName || null,
      input.sponsorWebsite || null,
      Boolean(input.sponsorDisplayPublicly),
      Boolean(input.anonymous),
    ]
  );

  return session;
}

function timingSafeEqualString(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

export function verifyStripeWebhook(rawBody: string, signatureHeader: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  if (!signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [k, v] = part.split("=");
      return [k, v];
    })
  );

  const timestamp = parts.t;
  const supplied = parts.v1;
  if (!timestamp || !supplied) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  return timingSafeEqualString(expected, supplied);
}

export async function processStripeEvent(event: any) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object;
    const paid = session.payment_status === "paid" || event.type === "checkout.session.async_payment_succeeded";
    if (!paid) return;

    const metadata = session.metadata || {};
    const result = await db.query(
      `update support_contributions
       set status='paid',
           stripe_payment_intent_id=$1,
           stripe_customer_email=$2,
           paid_at=coalesce(paid_at, now())
       where stripe_checkout_session_id=$3
       returning *`,
      [
        typeof session.payment_intent === "string" ? session.payment_intent : null,
        session.customer_details?.email || session.customer_email || null,
        session.id,
      ]
    );

    const contribution = result.rows[0];
    if (
      contribution &&
      contribution.contribution_type === "sponsor" &&
      contribution.organization_id &&
      contribution.sponsor_name &&
      contribution.sponsor_display_publicly &&
      !contribution.anonymous
    ) {
      await db.query(
        `insert into organization_sponsors
          (organization_id, contribution_id, sponsor_name, sponsor_website, public_display, status)
         values ($1,$2,$3,$4,true,'active')
         on conflict do nothing`,
        [
          contribution.organization_id,
          contribution.id,
          contribution.sponsor_name,
          contribution.sponsor_website,
        ]
      );
    }
  }

  if (event.type === "checkout.session.async_payment_failed") {
    const session = event.data.object;
    await db.query(
      `update support_contributions set status='failed'
       where stripe_checkout_session_id=$1`,
      [session.id]
    );
  }

  if (event.type === "charge.refunded") {
    const charge = event.data.object;
    if (charge.payment_intent) {
      await db.query(
        `update support_contributions
         set status='refunded', refunded_at=now()
         where stripe_payment_intent_id=$1`,
        [charge.payment_intent]
      );
    }
  }
}

export async function supportDashboard(organizationId?: string | null) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");

  const contributionParams: any[] = [];
  let orgWhere = "";
  if (organizationId) {
    contributionParams.push(organizationId);
    orgWhere = `and organization_id=$${contributionParams.length}`;
  }

  const contributions = await db.query(
    `select
       coalesce(sum(amount_cents) filter (where status='paid'),0)::int as total_support_cents,
       coalesce(sum(amount_cents) filter (where status='paid' and contribution_type='individual'),0)::int as individual_support_cents,
       coalesce(sum(amount_cents) filter (where status='paid' and contribution_type='sponsor'),0)::int as sponsor_support_cents,
       count(*) filter (where status='paid')::int as paid_contribution_count
     from support_contributions
     where created_at >= date_trunc('month', now()) ${orgWhere}`,
    contributionParams
  );

  const rides = await db.query(
    `select count(*)::int as rides
     from calendar_events
     where starts_at >= date_trunc('month', now())
       and starts_at < date_trunc('month', now()) + interval '1 month'`
  ).catch(() => ({ rows: [{ rides: 0 }] }));

  let organization: any = null;
  let sponsors: any[] = [];
  if (organizationId) {
    organization = (
      await db.query(
        `select id,name,slug,support_enabled,sponsorship_enabled,
                estimated_cost_per_ride_cents,contribution_prompt_frequency
         from organizations where id=$1`,
        [organizationId]
      )
    ).rows[0] || null;

    sponsors = (
      await db.query(
        `select sponsor_name,sponsor_website,logo_url,starts_at,ends_at
         from organization_sponsors
         where organization_id=$1 and status='active'
           and (ends_at is null or ends_at > now())
         order by starts_at desc`,
        [organizationId]
      )
    ).rows;
  }

  const rideCount = Number(rides.rows[0]?.rides || 0);
  const estimatedCostPerRide = organization?.estimated_cost_per_ride_cents ?? 25;
  const estimatedCost = rideCount * estimatedCostPerRide;
  const totals = contributions.rows[0];

  return {
    organization,
    rideCount,
    estimatedCostPerRideCents: estimatedCostPerRide,
    estimatedTechnologyCostCents: estimatedCost,
    individualSupportCents: Number(totals.individual_support_cents || 0),
    sponsorSupportCents: Number(totals.sponsor_support_cents || 0),
    totalSupportCents: Number(totals.total_support_cents || 0),
    paidContributionCount: Number(totals.paid_contribution_count || 0),
    coveragePercent:
      estimatedCost > 0
        ? Math.round((Number(totals.total_support_cents || 0) / estimatedCost) * 100)
        : 0,
    sponsors,
  };
}
