// Search engine rules: robots.txt, sitemap entries, X-Robots-Tag, and
// canonical origins. Pure functions only (no imports) so tests can load this
// file directly. Callers pass in hostnames and env values.
//
// Principles
// - Only the product site (bandwagon.club) is indexed, and only its public
//   marketing, help, legal, and opted-in impact pages.
// - Community (tenant) hosts expose at most their landing page. Nothing
//   behind sign-in, and no member data, is ever indexable.
// - Staging is never indexed.
// - Canonical URLs always point at the primary product host, never at a
//   legacy harrisonward.* host or localhost.

export const DEFAULT_SEO_ORIGIN = "https://bandwagon.club";

/** Public product pages that search engines may index. Paths only. */
export const PUBLIC_MARKETING_PATHS = [
  "/",
  "/start",
  "/help",
  "/status",
  "/security",
  "/terms",
  "/privacy",
  "/cookies",
  "/sms-opt-in",
  "/legal",
  "/legal/organization-agreement",
  "/legal/student-data",
  "/legal/subprocessors",
] as const;

/** Prefixes that are behind sign-in, carry tokens, or are operational. Never indexed. */
export const PRIVATE_PATH_PREFIXES = [
  "/admin",
  "/api",
  "/app",
  "/invite",
  "/login",
  "/messaging",
  "/notifications",
  "/support",
  "/organization-decommission",
] as const;

/** Files a tenant host may still serve to crawlers (share cards, icons). */
export const TENANT_CRAWLABLE_ASSETS = ["/opengraph-image", "/twitter-image", "/icons/", "/social/"] as const;

export type RobotsRule = { userAgent: string; allow?: string[]; disallow?: string[] };
export type RobotsPolicy = { rules: RobotsRule[]; sitemap?: string; host?: string };

export type HostKind = "platform" | "tenant";

function cleanHost(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .split(",")[0]
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .split(":")[0]
    .replace(/\.$/, "");
}

export function hostKind(host: string, platformHosts: Iterable<string>): HostKind {
  const clean = cleanHost(host);
  for (const platform of platformHosts) if (cleanHost(platform) === clean) return "platform";
  return "tenant";
}

export function isPrivatePath(pathname: string) {
  const path = String(pathname || "/");
  return PRIVATE_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`));
}

function isLocalOrLegacy(hostname: string, legacyHosts: string[], legacyTenantBases: string[]) {
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".local") || !hostname.includes(".")) return true;
  if (legacyHosts.includes(hostname)) return true;
  return legacyTenantBases.some((base) => hostname === base || hostname.endsWith(`.${base}`));
}

/**
 * Origin used for canonical URLs, metadataBase, and the sitemap. APP_URL wins
 * when it is a real https product URL. A localhost or legacy (harrisonward.*)
 * APP_URL falls back to the primary platform origin, so canonicals always
 * name bandwagon.club in production.
 */
export function seoOrigin(input: { appUrl?: string | null; platformOrigin?: string | null; legacyHosts?: string[]; legacyTenantBases?: string[] }) {
  const legacyHosts = (input.legacyHosts || []).map(cleanHost);
  const legacyBases = (input.legacyTenantBases || []).map(cleanHost);
  for (const candidate of [input.appUrl, input.platformOrigin]) {
    if (!candidate) continue;
    try {
      const url = new URL(String(candidate).trim());
      if (url.protocol !== "https:") continue;
      if (isLocalOrLegacy(url.hostname.toLowerCase(), legacyHosts, legacyBases)) continue;
      return url.origin;
    } catch {
      continue;
    }
  }
  return DEFAULT_SEO_ORIGIN;
}

/** Canonical origin for a community's own site: its issued hostname on the current tenant domain. */
export function tenantCanonicalOrigin(input: { primaryHostname?: string | null; hostname: string; tenantBase: string; legacyTenantBases?: string[] }) {
  let host = cleanHost(input.primaryHostname || input.hostname);
  for (const base of (input.legacyTenantBases || []).map(cleanHost)) {
    if (base && base !== input.tenantBase && host.endsWith(`.${base}`)) {
      host = `${host.slice(0, -(base.length + 1))}.${input.tenantBase}`;
      break;
    }
  }
  return `https://${host}`;
}

/** robots.txt contents for the requesting host. */
export function robotsPolicy(input: { kind: HostKind; staging: boolean; origin: string }): RobotsPolicy {
  if (input.staging) return { rules: [{ userAgent: "*", disallow: ["/"] }] };
  if (input.kind === "tenant") {
    // "/$" matches only the landing page. Longest match wins, so it beats "/".
    return { rules: [{ userAgent: "*", allow: ["/$", ...TENANT_CRAWLABLE_ASSETS], disallow: ["/"] }] };
  }
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/impact/", "/legal/", "/llms.txt"],
        disallow: PRIVATE_PATH_PREFIXES.map((prefix) => prefix),
      },
    ],
    sitemap: `${input.origin}/sitemap.xml`,
    host: input.origin,
  };
}

/** Render a RobotsPolicy as robots.txt text (used by tests and docs). */
export function robotsText(policy: RobotsPolicy) {
  const lines: string[] = [];
  for (const rule of policy.rules) {
    lines.push(`User-Agent: ${rule.userAgent}`);
    for (const path of rule.allow || []) lines.push(`Allow: ${path}`);
    for (const path of rule.disallow || []) lines.push(`Disallow: ${path}`);
    lines.push("");
  }
  if (policy.host) lines.push(`Host: ${policy.host}`);
  if (policy.sitemap) lines.push(`Sitemap: ${policy.sitemap}`);
  return lines.join("\n");
}

/** Would a crawler following this policy be allowed to fetch the path? (Google longest-match semantics.) */
export function robotsAllows(policy: RobotsPolicy, pathname: string) {
  const rule = policy.rules.find((r) => r.userAgent === "*");
  if (!rule) return true;
  let best: { length: number; allow: boolean } | null = null;
  const consider = (pattern: string, allow: boolean) => {
    const anchored = pattern.endsWith("$");
    const body = anchored ? pattern.slice(0, -1) : pattern;
    const matches = anchored ? pathname === body : pathname.startsWith(body);
    if (!matches) return;
    if (!best || pattern.length > best.length || (pattern.length === best.length && allow)) best = { length: pattern.length, allow };
  };
  for (const p of rule.allow || []) consider(p, true);
  for (const p of rule.disallow || []) consider(p, false);
  return best ? (best as { allow: boolean }).allow : true;
}

export type SitemapEntry = { url: string; changeFrequency: "daily" | "weekly" | "monthly" | "yearly"; priority: number };

function publicImpactSlug(value: string) {
  const slug = String(value || "").toLowerCase();
  return /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(slug) ? slug : null;
}

/**
 * Sitemap for the requesting host. Tenants and staging get an empty sitemap.
 * impactSlugs must already be limited to organizations that turned on their
 * public impact page (see listPublicImpactSlugs in org-impact.ts).
 */
export function sitemapEntries(input: { kind: HostKind; staging: boolean; origin: string; impactSlugs?: string[] }): SitemapEntry[] {
  if (input.staging || input.kind !== "platform") return [];
  const pages: SitemapEntry[] = PUBLIC_MARKETING_PATHS.map((path) => ({
    url: `${input.origin}${path === "/" ? "" : path}`,
    changeFrequency: path === "/" || path === "/help" || path === "/status" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : path === "/start" || path === "/help" ? 0.8 : 0.5,
  }));
  const impact = [...new Set((input.impactSlugs || []).map(publicImpactSlug).filter((s): s is string => Boolean(s)))]
    .sort()
    .map((slug) => ({ url: `${input.origin}/impact/${slug}`, changeFrequency: "weekly" as const, priority: 0.4 }));
  return [...pages, ...impact];
}

export const NOINDEX_HEADER = "noindex, nofollow";

/**
 * X-Robots-Tag for a page response, or null for none. Set in middleware so it
 * covers client pages, API responses, and tenant hosts without a DB lookup.
 */
export function robotsHeaderFor(input: { kind: HostKind; staging: boolean; pathname: string }) {
  if (input.staging) return NOINDEX_HEADER;
  const path = input.pathname || "/";
  if (input.kind === "tenant") {
    if (path === "/" || path === "/robots.txt" || TENANT_CRAWLABLE_ASSETS.some((asset) => path.startsWith(asset))) return null;
    return NOINDEX_HEADER;
  }
  return isPrivatePath(path) ? NOINDEX_HEADER : null;
}
