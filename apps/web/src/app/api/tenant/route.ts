import { resolveTenant } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const tenant = await resolveTenant();
  if (tenant.type === "platform") {
    return Response.json({ type: "platform", hostname: tenant.hostname });
  }

  return Response.json({
    type: "organization",
    hostname: tenant.hostname,
    organization: {
      id: tenant.organizationId,
      slug: tenant.slug,
      name: tenant.name,
      displayName: tenant.displayName,
      primaryHostname: tenant.primaryHostname,
    },
  });
}
