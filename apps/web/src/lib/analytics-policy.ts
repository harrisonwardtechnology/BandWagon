// Privacy rules for the self-hosted Umami analytics.
// No "@/" imports so node --test can load this file directly.

/** Paths whose next segment is a secret token. The token is replaced before anything is sent. */
const TOKEN_PATHS = ["/invite/", "/household-invite/", "/organization-decommission/"];

/**
 * Clean a URL before it leaves the browser: drop the query string and hash,
 * and replace invite and other one-time tokens with ":token". Only the path
 * is kept, so no email, code, or ID in a link ever reaches analytics.
 */
export function scrubAnalyticsUrl(url: string) {
  let path = String(url || "/");
  try { path = new URL(path, "https://bandwagon.invalid").pathname; } catch { path = "/"; }
  for (const prefix of TOKEN_PATHS) {
    if (path.startsWith(prefix)) {
      const rest = path.slice(prefix.length).split("/");
      // decommission has a fixed "confirm" page and no token in the path; leave it.
      if (prefix === "/organization-decommission/" && rest[0] === "confirm") return path;
      return prefix + ":token" + (rest.length > 1 ? "/" + rest.slice(1).join("/") : "");
    }
  }
  return path;
}

/** Umami is on only when a website ID is set at build time. */
export function analyticsConfig(env: Record<string, string | undefined>) {
  const websiteId = String(env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(websiteId)) return null;
  const src = String(env.NEXT_PUBLIC_UMAMI_SRC || "https://stats.harrisonward.net/script.js").trim();
  if (!/^https:\/\/[^\s"']+$/.test(src)) return null;
  return { websiteId, src };
}
