import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  PRIVATE_PATH_PREFIXES,
  PUBLIC_MARKETING_PATHS,
  hostKind,
  robotsAllows,
  robotsHeaderFor,
  robotsPolicy,
  robotsText,
  seoOrigin,
  sitemapEntries,
  tenantCanonicalOrigin,
} from "../src/lib/seo-policy.ts";
import { faqJsonLd, productJsonLd, serializeJsonLd } from "../src/lib/json-ld.ts";

const origin = "https://bandwagon.club";
const platform = robotsPolicy({ kind: "platform", staging: false, origin });
const tenant = robotsPolicy({ kind: "tenant", staging: false, origin });
const staging = robotsPolicy({ kind: "platform", staging: true, origin });

test("platform robots allow public pages and block admin, api, and signed-in areas", () => {
  for (const path of ["/", "/start", "/help", "/status", "/terms", "/privacy", "/cookies", "/legal/student-data", "/security", "/sms-opt-in", "/impact/fmhs-band"]) {
    assert.equal(robotsAllows(platform, path), true, path);
  }
  for (const path of ["/admin", "/admin/tenants", "/api/product", "/api/review-package", "/app", "/app/rides", "/invite/abc123", "/login", "/login?token=x", "/messaging", "/notifications", "/support", "/organization-decommission/confirm"]) {
    assert.equal(robotsAllows(platform, path), false, path);
  }
  const text = robotsText(platform);
  assert.match(text, /^Disallow: \/admin$/m);
  assert.match(text, /^Disallow: \/api$/m);
  assert.match(text, /^Sitemap: https:\/\/bandwagon\.club\/sitemap\.xml$/m);
});

test("staging robots disallow everything and advertise no sitemap", () => {
  assert.deepEqual(staging.rules, [{ userAgent: "*", disallow: ["/"] }]);
  assert.equal(staging.sitemap, undefined);
  for (const path of ["/", "/help", "/privacy"]) assert.equal(robotsAllows(staging, path), false, path);
  assert.deepEqual(robotsPolicy({ kind: "tenant", staging: true, origin }).rules, [{ userAgent: "*", disallow: ["/"] }]);
});

test("tenant robots expose only the landing page and share assets", () => {
  assert.equal(robotsAllows(tenant, "/"), true);
  assert.equal(robotsAllows(tenant, "/opengraph-image"), true);
  for (const path of ["/app", "/help", "/login", "/admin/branding", "/impact/x", "/privacy", "/sitemap.xml"]) assert.equal(robotsAllows(tenant, path), false, path);
  assert.equal(tenant.sitemap, undefined);
});

test("tenant pages other than the landing page, signed-in pages, and staging get noindex headers", () => {
  const noindex = "noindex, nofollow";
  assert.equal(robotsHeaderFor({ kind: "tenant", staging: false, pathname: "/" }), null);
  for (const path of ["/app", "/app/rides", "/login", "/help", "/admin", "/impact/x"]) {
    assert.equal(robotsHeaderFor({ kind: "tenant", staging: false, pathname: path }), noindex, path);
  }
  for (const prefix of PRIVATE_PATH_PREFIXES) {
    assert.equal(robotsHeaderFor({ kind: "platform", staging: false, pathname: `${prefix}/x` }), noindex, prefix);
  }
  assert.equal(robotsHeaderFor({ kind: "platform", staging: false, pathname: "/help" }), null);
  assert.equal(robotsHeaderFor({ kind: "platform", staging: true, pathname: "/" }), noindex);
});

test("host kind: only configured platform hosts are the product site", () => {
  const hosts = ["bandwagon.club", "www.bandwagon.club", "localhost"];
  assert.equal(hostKind("bandwagon.club", hosts), "platform");
  assert.equal(hostKind("BandWagon.club:443", hosts), "platform");
  assert.equal(hostKind("fmhs.bandwagon.club", hosts), "tenant");
  assert.equal(hostKind("rides.example.org", hosts), "tenant");
});

test("sitemap lists only public pages and opted-in impact slugs, on the product host only", () => {
  const entries = sitemapEntries({ kind: "platform", staging: false, origin, impactSlugs: ["fmhs-band", "fmhs-band", "Bad Slug!", "../admin"] });
  const urls = entries.map((e) => e.url);
  assert.ok(urls.includes("https://bandwagon.club"));
  assert.ok(urls.includes("https://bandwagon.club/help"));
  assert.ok(urls.includes("https://bandwagon.club/impact/fmhs-band"));
  assert.equal(urls.filter((u) => u.endsWith("/impact/fmhs-band")).length, 1);
  assert.equal(urls.length, PUBLIC_MARKETING_PATHS.length + 1);
  const policy = robotsPolicy({ kind: "platform", staging: false, origin });
  for (const url of urls) {
    const path = new URL(url).pathname;
    assert.equal(robotsAllows(policy, path), true, `${url} must be crawlable`);
    assert.equal(robotsHeaderFor({ kind: "platform", staging: false, pathname: path }), null, `${url} must be indexable`);
    for (const prefix of PRIVATE_PATH_PREFIXES) assert.ok(!path.startsWith(prefix), `${url} must not be private`);
  }
  assert.deepEqual(sitemapEntries({ kind: "tenant", staging: false, origin, impactSlugs: ["x"] }), []);
  assert.deepEqual(sitemapEntries({ kind: "platform", staging: true, origin, impactSlugs: ["x"] }), []);
});

test("canonical origin prefers APP_URL but never localhost or a legacy host", () => {
  const legacy = { legacyHosts: ["bandwagon.harrisonward.net"], legacyTenantBases: ["harrisonward.org"] };
  assert.equal(seoOrigin({ appUrl: "https://bandwagon.club/", platformOrigin: "https://bandwagon.club", ...legacy }), "https://bandwagon.club");
  assert.equal(seoOrigin({ appUrl: "http://localhost:3000", platformOrigin: "https://bandwagon.club", ...legacy }), "https://bandwagon.club");
  assert.equal(seoOrigin({ appUrl: "https://bandwagon.harrisonward.net", platformOrigin: "https://bandwagon.club", ...legacy }), "https://bandwagon.club");
  assert.equal(seoOrigin({ appUrl: undefined, platformOrigin: "https://bandwagon.harrisonward.net", ...legacy }), "https://bandwagon.club");
  assert.equal(
    tenantCanonicalOrigin({ primaryHostname: "fmhs.harrisonward.org", hostname: "x", tenantBase: "bandwagon.club", legacyTenantBases: ["harrisonward.org"] }),
    "https://fmhs.bandwagon.club",
  );
});

test("JSON-LD serialization escapes < so page text cannot close the script tag", () => {
  const out = serializeJsonLd({ name: "</script><script>alert(1)</script>", other: "a & b > c \u2028" });
  assert.doesNotMatch(out, /</);
  assert.doesNotMatch(out, />/);
  assert.doesNotMatch(out, /\u2028/);
  assert.match(out, /\\u003c\/script\\u003e/);
  assert.deepEqual(JSON.parse(out), { name: "</script><script>alert(1)</script>", other: "a & b > c \u2028" });
});

test("product JSON-LD describes a free app from Harrison Ward Technology", () => {
  const [org, site, app] = productJsonLd(origin) as Array<Record<string, any>>;
  assert.equal(org["@type"], "Organization");
  assert.equal(org.logo, "https://bandwagon.club/icons/icon-512.png");
  assert.equal(org.parentOrganization.name, "Harrison Ward Technology");
  assert.equal(site["@type"], "WebSite");
  assert.equal(app["@type"], "SoftwareApplication");
  assert.equal(app.offers.price, "0");
  assert.equal(app.offers.priceCurrency, "USD");
  assert.doesNotMatch(JSON.stringify([org, site, app]), /open.source/i);
  const faq = faqJsonLd([["Q?", "A."]]) as Record<string, any>;
  assert.equal(faq["@type"], "FAQPage");
  assert.equal(faq.mainEntity[0].acceptedAnswer.text, "A.");
});

test("signed-in areas and tenant pages are noindex in page metadata", () => {
  for (const file of ["src/app/app/layout.tsx", "src/app/admin/layout.tsx", "src/app/login/layout.tsx", "src/app/notifications/layout.tsx", "src/app/support/layout.tsx", "src/app/organization-decommission/layout.tsx"]) {
    assert.match(fs.readFileSync(file, "utf8"), /privatePageMetadata\(/, file);
  }
  assert.match(fs.readFileSync("src/app/invite/[token]/page.tsx", "utf8"), /robots: \{ index: false/);
  const home = fs.readFileSync("src/app/page.tsx", "utf8");
  assert.match(home, /tenant\.type === "organization"[\s\S]*follow: false/);
  assert.match(home, /resolveBranding\(/);
  const middleware = fs.readFileSync("src/middleware.ts", "utf8");
  assert.match(middleware, /X-Robots-Tag/);
  assert.match(middleware, /robotsHeaderFor\(/);
});

test("layout has no site-wide canonical and no open-source claim", () => {
  const layout = fs.readFileSync("src/app/layout.tsx", "utf8");
  assert.doesNotMatch(layout, /canonical\s*:/);
  assert.doesNotMatch(layout, /open.source/i);
  assert.match(layout, /template: "%s \| BandWagon"/);
  assert.match(layout, /summary_large_image/);
  for (const file of ["src/app/terms/page.tsx", "src/app/privacy/page.tsx", "src/app/cookies/page.tsx", "src/app/sms-opt-in/page.tsx"]) {
    assert.doesNotMatch(fs.readFileSync(file, "utf8"), /title: "[^"]*\| BandWagon"/, `${file} would double the title suffix`);
  }
  assert.ok(fs.existsSync("public/llms.txt"));
});
