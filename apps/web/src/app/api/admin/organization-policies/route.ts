import { NextResponse } from "next/server";
import { requireSessionIdentity } from "@/lib/auth";
import { listOrganizationsForAdministrator } from "@/lib/admin-access";
import {
  acceptOrganizationPolicies,
  organizationPolicyStatus,
} from "@/lib/organization-policy-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateResponse = { headers: { "cache-control": "no-store, private" } };

export async function GET(request: Request) {
  try {
    const identity = await requireSessionIdentity();
    const organizationId = new URL(request.url).searchParams.get("organizationId");
    const organizations = await listOrganizationsForAdministrator();
    if (!organizationId) return NextResponse.json({ ok: true, organizations, status: null }, privateResponse);
    return NextResponse.json({
      ok: true,
      organizations,
      status: await organizationPolicyStatus(identity, organizationId),
    }, privateResponse);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Organization policy access denied" }, { status: 403, ...privateResponse });
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireSessionIdentity();
    const body = await request.json().catch(() => ({}));
    if (body.action !== "accept") return NextResponse.json({ error: "Unknown action" }, { status: 400, ...privateResponse });
    const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const result = await acceptOrganizationPolicies(identity, {
      organizationId: String(body.organizationId || ""),
      authorityConfirmed: body.authorityConfirmed === true,
      policiesReviewed: body.policiesReviewed === true,
      confirmation: String(body.confirmation || ""),
      sourceIp: forwardedFor,
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.json({ ok: true, result }, privateResponse);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to accept organization policies" }, { status: 400, ...privateResponse });
  }
}
