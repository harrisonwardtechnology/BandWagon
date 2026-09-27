// Product domain settings. Pure functions only (no imports) so tests can load
// this file directly.
//
// PLATFORM_HOSTNAMES  comma list of hostnames that serve the BandWagon product
//                     site (not a tenant). The first entry is the primary host.
// TENANT_BASE_DOMAIN  parent domain for default tenant hostnames
//                     (<slug>.<TENANT_BASE_DOMAIN>).
//
// LEGACY_PLATFORM_HOSTNAMES   old product hostnames that now redirect to the
//                             primary platform host.
// LEGACY_TENANT_BASE_DOMAINS  old tenant parent domains; <slug>.<old> redirects
//                             to <slug>.<TENANT_BASE_DOMAIN>.
//
// The product moved to bandwagon.club on 2026-09-27. The old harrisonward
// hosts stay resolvable and redirect, so links, bookmarks, and customer
// CNAMEs keep working. See docs/operations/MOVE-TO-BANDWAGON-CLUB.md.

export const DEFAULT_PLATFORM_HOSTNAMES = ["bandwagon.club", "www.bandwagon.club"] as const;
export const DEFAULT_TENANT_BASE_DOMAIN = "bandwagon.club";
export const DEFAULT_LEGACY_PLATFORM_HOSTNAMES = ["bandwagon.harrisonward.net", "www.bandwagon.harrisonward.net"] as const;
export const DEFAULT_LEGACY_TENANT_BASE_DOMAINS = ["harrisonward.org"] as const;
const LOCAL_HOSTNAMES = ["localhost", "127.0.0.1"];

function cleanHostname(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .split(":")[0]
    .replace(/\.$/, "");
}

function isHostname(value: string) {
  return /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
}

/** Configured product hostnames, primary first. Falls back to the defaults. */
export function parsePlatformHostnames(value: string | undefined): string[] {
  const configured = String(value || "")
    .split(",")
    .map(cleanHostname)
    .filter((host) => host && isHostname(host));
  const list = configured.length ? configured : [...DEFAULT_PLATFORM_HOSTNAMES];
  return [...new Set(list)];
}

/** Every hostname that must resolve to the platform, including local dev hosts. */
export function platformHostSet(value: string | undefined): Set<string> {
  return new Set([...parsePlatformHostnames(value), ...LOCAL_HOSTNAMES]);
}

export function parseTenantBaseDomain(value: string | undefined): string {
  const cleaned = cleanHostname(String(value || "")).replace(/^\*\./, "");
  return cleaned && isHostname(cleaned) && cleaned.includes(".") ? cleaned : DEFAULT_TENANT_BASE_DOMAIN;
}

export function platformHostnames() {
  return parsePlatformHostnames(process.env.PLATFORM_HOSTNAMES);
}

export function primaryPlatformHostname() {
  return platformHostnames()[0];
}

export function tenantBaseDomain() {
  return parseTenantBaseDomain(process.env.TENANT_BASE_DOMAIN);
}

/** Public product origin, for links in emails, metadata, and payment return URLs. */
export function platformOrigin() {
  return `https://${primaryPlatformHostname()}`;
}

/** Hostname as it should be read aloud by a phone greeting ("a dot b dot c"). */
export function spokenHostname(hostname: string) {
  return hostname.split(".").join(" dot ");
}

function parseHostList(value: string | undefined, fallback: readonly string[]) {
  if (value === undefined) return [...fallback];
  // An explicitly empty value turns legacy handling off.
  return [...new Set(String(value).split(",").map(cleanHostname).filter((h) => h && isHostname(h)))];
}

export function legacyPlatformHostnames(value = process.env.LEGACY_PLATFORM_HOSTNAMES) {
  return parseHostList(value, DEFAULT_LEGACY_PLATFORM_HOSTNAMES);
}

export function legacyTenantBaseDomains(value = process.env.LEGACY_TENANT_BASE_DOMAINS) {
  return parseHostList(value, DEFAULT_LEGACY_TENANT_BASE_DOMAINS).map((d) => d.replace(/^\*\./, ""));
}

/**
 * Where an old-domain request should go, or null to serve it as-is.
 * Only page loads (GET/HEAD outside /api and /.well-known) are redirected.
 * Webhooks and API calls keep working on the old host, because Twilio,
 * Stripe, and OAuth providers do not reliably follow redirects on POSTs.
 */
export function legacyRedirectTarget(input: {
  host: string;
  pathname: string;
  search?: string;
  method: string;
  platformHosts?: string[];
  tenantBase?: string;
  legacyPlatformHosts?: string[];
  legacyTenantBases?: string[];
}): string | null {
  const method = input.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return null;
  if (input.pathname.startsWith("/api/") || input.pathname.startsWith("/.well-known/")) return null;
  const host = cleanHostname(input.host);
  const platform = (input.platformHosts || platformHostnames())[0];
  const tenantBase = input.tenantBase || tenantBaseDomain();
  const legacyPlatform = input.legacyPlatformHosts || legacyPlatformHostnames();
  const legacyTenant = input.legacyTenantBases || legacyTenantBaseDomains();
  const rest = `${input.pathname}${input.search || ""}`;

  if (legacyPlatform.includes(host) && host !== platform) return `https://${platform}${rest}`;
  for (const base of legacyTenant) {
    if (base === tenantBase || !host.endsWith(`.${base}`)) continue;
    const label = host.slice(0, -(base.length + 1));
    // One DNS level only, matching how tenant hostnames are issued.
    if (!label || label.includes(".")) continue;
    return `https://${label}.${tenantBase}${rest}`;
  }
  return null;
}
