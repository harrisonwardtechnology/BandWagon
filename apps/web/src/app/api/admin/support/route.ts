import { requireAdminTestToken } from "@/lib/admin-test";
import { supportDashboard } from "@/lib/stripe-support";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = requireAdminTestToken(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");
  return Response.json(await supportDashboard(organizationId));
}

export async function POST(request: Request) {
  const denied = requireAdminTestToken(request);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
  if (!organizationId) return Response.json({ error: "organizationId is required" }, { status: 400 });

  const db = getDb();
  if (!db) return Response.json({ error: "Database is not configured" }, { status: 503 });

  const supportEnabled = Boolean(body.supportEnabled);
  const sponsorshipEnabled = Boolean(body.sponsorshipEnabled);
  const estimatedCostPerRideCents = Number(body.estimatedCostPerRideCents || 25);
  const contributionPromptFrequency = Number(body.contributionPromptFrequency || 5);

  await db.query(
    `update organizations
     set support_enabled=$1,
         sponsorship_enabled=$2,
         estimated_cost_per_ride_cents=$3,
         contribution_prompt_frequency=$4
     where id=$5`,
    [
      supportEnabled,
      sponsorshipEnabled,
      estimatedCostPerRideCents,
      contributionPromptFrequency,
      organizationId,
    ]
  );

  return Response.json({ ok: true });
}
