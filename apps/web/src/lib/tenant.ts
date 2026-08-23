import { headers } from "next/headers";
import { resolveOrganizationByHostname } from "@/lib/saas-tenants";

export type TenantResolution =
  | { type: "platform"; hostname: string }
  | {
      type: "organization";
      hostname: string;
      organizationId: string;
      slug: string;
      name: string;
      displayName: string;
      primaryHostname: string | null;
      branding: Record<string, unknown>;
      settings: Record<string, unknown>;
    };

const PLATFORM_HOSTS = new Set([
  "bandwagon.harrisonward.net",
  "www.bandwagon.harrisonward.net",
  "localhost",
  "127.0.0.1",
]);

export async function resolveTenant(): Promise<TenantResolution> {
  const h = await headers();
  const hostname = (h.get("x-forwarded-host") || h.get("host") || "localhost")
    .split(":")[0]
    .toLowerCase();

  if (PLATFORM_HOSTS.has(hostname)) {
    return { type: "platform", hostname };
  }

  // Only active, verified organization_domains rows can select a tenant.
  // This prevents an arbitrary Host header from crossing tenant boundaries.
  const organization = await resolveOrganizationByHostname(hostname);
  if (!organization) return { type: "platform", hostname };

  return {
    type: "organization",
    hostname,
    organizationId: organization.id,
    slug: organization.slug,
    name: organization.name,
    displayName: organization.display_name || organization.name,
    primaryHostname: organization.tenant_hostname || null,
    branding: organization.branding || {},
    settings: organization.settings || {},
  };
}
