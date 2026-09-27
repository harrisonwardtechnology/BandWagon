// Product domain settings. Pure functions only (no imports) so tests can load
// this file directly.
//
// PLATFORM_HOSTNAMES  comma list of hostnames that serve the BandWagon product
//                     site (not a tenant). The first entry is the primary host.
// TENANT_BASE_DOMAIN  parent domain for default tenant hostnames
//                     (<slug>.<TENANT_BASE_DOMAIN>).
//
// Defaults keep the current production values so nothing changes until the
// variables are set. See docs/operations/CHANGING-TENANT-DOMAIN.md.

export const DEFAULT_PLATFORM_HOSTNAMES = ["bandwagon.harrisonward.net", "www.bandwagon.harrisonward.net"] as const;
export const DEFAULT_TENANT_BASE_DOMAIN = "harrisonward.org";
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
