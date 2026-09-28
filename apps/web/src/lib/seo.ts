import type { Metadata } from "next";
import { legacyPlatformHostnames, legacyTenantBaseDomains, platformHostSet, platformOrigin } from "@/lib/platform-hosts";
import { isStagingEnvironment } from "@/lib/public-links";
import { hostKind, seoOrigin, type HostKind } from "@/lib/seo-policy";
import { PRODUCT_TAGLINE } from "@/lib/json-ld";

/** Canonical product origin (APP_URL when it is a real https product URL, else the primary platform host). */
export function siteOrigin() {
  return seoOrigin({
    appUrl: process.env.APP_URL,
    platformOrigin: platformOrigin(),
    legacyHosts: legacyPlatformHostnames(),
    legacyTenantBases: legacyTenantBaseDomains(),
  });
}

export function requestHostKind(host: string): HostKind {
  return hostKind(host, platformHostSet(process.env.PLATFORM_HOSTNAMES));
}

export const OG_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: `BandWagon: ${PRODUCT_TAGLINE}` };
export const TWITTER_IMAGE = "/twitter-image";

export const NOINDEX: Metadata["robots"] = { index: false, follow: false };

/**
 * Metadata for a public product page: title, description, canonical, and share
 * cards. Pages behind sign-in should use privatePageMetadata instead.
 */
export function publicPageMetadata(input: { title: string; description: string; path: string; absoluteTitle?: boolean }): Metadata {
  const title = input.absoluteTitle ? { absolute: input.title } : input.title;
  const shareTitle = input.absoluteTitle ? input.title : `${input.title} | BandWagon`;
  return {
    title,
    description: input.description,
    alternates: { canonical: input.path },
    openGraph: {
      title: shareTitle,
      description: input.description,
      url: input.path,
      siteName: "BandWagon",
      locale: "en_US",
      type: "website",
      images: [OG_IMAGE],
    },
    twitter: { card: "summary_large_image", title: shareTitle, description: input.description, images: [TWITTER_IMAGE] },
    ...(isStagingEnvironment() ? { robots: NOINDEX } : {}),
  };
}

/** Metadata for anything behind sign-in or carrying a token: never indexed. */
export function privatePageMetadata(title: string): Metadata {
  return { title, robots: NOINDEX };
}
