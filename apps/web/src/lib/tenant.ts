import { headers } from "next/headers";

export type TenantResolution =
  | { type: "platform"; hostname: string }
  | { type: "organization"; hostname: string; organizationId: string };

export async function resolveTenant(): Promise<TenantResolution> {
  const h = await headers();
  const hostname = (h.get("x-forwarded-host") || h.get("host") || "localhost").split(":")[0].toLowerCase();

  // Production implementation: resolve only verified organization_domains rows.
  // Never trust arbitrary Host headers to select a tenant.
  if (hostname === "flomogo.app" || hostname === "www.flomogo.app") {
    return { type: "organization", hostname, organizationId: "flomogo-placeholder" };
  }

  return { type: "platform", hostname };
}
