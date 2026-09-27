import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { listPublicImpactSlugs } from "@/lib/org-impact";
import { isStagingEnvironment } from "@/lib/public-links";
import { requestHostKind, siteOrigin } from "@/lib/seo";
import { sitemapEntries } from "@/lib/seo-policy";

// Product site only: public marketing, help, and legal pages, plus impact
// pages that an organization admin turned on. Tenant hosts and staging get an
// empty sitemap. Rules live in src/lib/seo-policy.ts.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost";
  const kind = requestHostKind(host);
  const staging = isStagingEnvironment();
  const impactSlugs = kind === "platform" && !staging ? await listPublicImpactSlugs().catch(() => []) : [];
  return sitemapEntries({ kind, staging, origin: siteOrigin(), impactSlugs });
}
