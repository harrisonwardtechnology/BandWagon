import { NextResponse } from "next/server";
import { listOrganizationsForAdministrator } from "@/lib/admin-access";
import { getOrganizationBranding, updateOrganizationBranding } from "@/lib/org-branding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "cache-control": "no-store, private" };

function statusFor(message: string) {
  if (/Authentication required/.test(message)) return 401;
  if (/access|required|Only owners|read-only/i.test(message)) return 403;
  return 400;
}

export async function GET(request: Request) {
  try {
    const organizationId = new URL(request.url).searchParams.get("organizationId") || "";
    if (!organizationId) return NextResponse.json({ ok: true, organizations: await listOrganizationsForAdministrator() }, { headers });
    return NextResponse.json({ ok: true, ...(await getOrganizationBranding(organizationId)) }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load branding";
    return NextResponse.json({ error: message }, { status: statusFor(message), headers });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await updateOrganizationBranding(String(body.organizationId || ""), body);
    if (!result.ok) return NextResponse.json({ error: "Check the highlighted fields", errors: result.errors }, { status: 400, headers });
    return NextResponse.json(result, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save branding";
    return NextResponse.json({ error: message }, { status: statusFor(message), headers });
  }
}
