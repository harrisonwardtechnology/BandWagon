import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { isStagingEnvironment } from "@/lib/public-links";
import { requestHostKind, siteOrigin } from "@/lib/seo";
import { robotsPolicy } from "@/lib/seo-policy";

// Host aware: the product site allows its public pages, community (tenant)
// hosts expose only their landing page, and staging blocks everything.
// Rules live in src/lib/seo-policy.ts.
export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost";
  const policy = robotsPolicy({ kind: requestHostKind(host), staging: isStagingEnvironment(), origin: siteOrigin() });
  return {
    rules: policy.rules.map((rule) => ({ userAgent: rule.userAgent, allow: rule.allow, disallow: rule.disallow })),
    ...(policy.sitemap ? { sitemap: policy.sitemap } : {}),
    ...(policy.host ? { host: policy.host } : {}),
  };
}
