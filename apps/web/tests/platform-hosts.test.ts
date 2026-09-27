import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  DEFAULT_PLATFORM_HOSTNAMES,
  DEFAULT_TENANT_BASE_DOMAIN,
  parsePlatformHostnames,
  parseTenantBaseDomain,
  platformHostSet,
  spokenHostname,
} from "../src/lib/platform-hosts.ts";

test("platform hostnames default to the current production hosts", () => {
  assert.deepEqual(parsePlatformHostnames(undefined), [...DEFAULT_PLATFORM_HOSTNAMES]);
  assert.deepEqual(parsePlatformHostnames(" , "), [...DEFAULT_PLATFORM_HOSTNAMES]);
});

test("PLATFORM_HOSTNAMES replaces the defaults and is normalized", () => {
  assert.deepEqual(parsePlatformHostnames("https://Rides.Example.com/, www.rides.example.com:443,rides.example.com"), [
    "rides.example.com",
    "www.rides.example.com",
  ]);
  assert.deepEqual(parsePlatformHostnames("bad host!,ok.example.org"), ["ok.example.org"]);
});

test("local development hosts always resolve to the platform", () => {
  const hosts = platformHostSet("rides.example.com");
  assert.ok(hosts.has("rides.example.com"));
  assert.ok(hosts.has("localhost"));
  assert.ok(hosts.has("127.0.0.1"));
  assert.ok(!hosts.has("bandwagon.harrisonward.net"), "configured hosts replace the defaults");
});

test("tenant base domain comes from env with a safe default", () => {
  assert.equal(parseTenantBaseDomain(undefined), DEFAULT_TENANT_BASE_DOMAIN);
  assert.equal(parseTenantBaseDomain("Rides.Example.com"), "rides.example.com");
  assert.equal(parseTenantBaseDomain("*.rides.example.com"), "rides.example.com");
  assert.equal(parseTenantBaseDomain("localhost"), DEFAULT_TENANT_BASE_DOMAIN);
});

test("phone greeting reads the hostname aloud", () => {
  assert.equal(spokenHostname("bandwagon.harrisonward.net"), "bandwagon dot harrisonward dot net");
});

test("tenant resolution no longer hardcodes only harrisonward hosts", () => {
  const tenant = fs.readFileSync("src/lib/tenant.ts", "utf8");
  assert.doesNotMatch(tenant, /harrisonward/);
  assert.doesNotMatch(tenant, /const PLATFORM_HOSTS = new Set\(\[/);
  assert.match(tenant, /PLATFORM_HOSTNAMES/);
  assert.match(tenant, /platformHostSet\(/);

  const saas = fs.readFileSync("src/lib/saas-tenants.ts", "utf8");
  assert.doesNotMatch(saas, /harrisonward/i);
  assert.match(saas, /tenantBaseDomain\(\)/);
});

test("app code and UI copy take the product domain from settings", () => {
  const files = [
    "src/app/layout.tsx",
    "src/app/support/page.tsx",
    "src/app/admin/tenants/page.tsx",
    "src/app/api/webhooks/twilio/voice/route.ts",
    "src/lib/stripe-support.ts",
    "src/lib/organization-decommission.ts",
  ];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /harrisonward\.org/, `${file} must not hardcode the tenant domain`);
    assert.doesNotMatch(source, /bandwagon\.harrisonward\.net/, `${file} must not hardcode the platform host`);
  }
});

import { legacyRedirectTarget, legacyPlatformHostnames, legacyTenantBaseDomains } from "../src/lib/platform-hosts.ts";

const moved = (host: string, pathname = "/", method = "GET", search = "") =>
  legacyRedirectTarget({
    host, pathname, search, method,
    platformHosts: ["bandwagon.club", "www.bandwagon.club"],
    tenantBase: "bandwagon.club",
    legacyPlatformHosts: ["bandwagon.harrisonward.net", "www.bandwagon.harrisonward.net"],
    legacyTenantBases: ["harrisonward.org"],
  });

test("bandwagon.club is the default product and tenant domain", () => {
  assert.deepEqual(parsePlatformHostnames(undefined), ["bandwagon.club", "www.bandwagon.club"]);
  assert.equal(parseTenantBaseDomain(undefined), "bandwagon.club");
  assert.deepEqual(legacyPlatformHostnames(undefined), ["bandwagon.harrisonward.net", "www.bandwagon.harrisonward.net"]);
  assert.deepEqual(legacyTenantBaseDomains(undefined), ["harrisonward.org"]);
  assert.deepEqual(legacyTenantBaseDomains(""), [], "an empty value turns legacy redirects off");
});

test("old page visits redirect to bandwagon.club, keeping path and query", () => {
  assert.equal(moved("bandwagon.harrisonward.net", "/login", "GET", "?next=/app"), "https://bandwagon.club/login?next=/app");
  assert.equal(moved("www.bandwagon.harrisonward.net"), "https://bandwagon.club/");
  assert.equal(moved("flomogo.harrisonward.org", "/app/rides"), "https://flomogo.bandwagon.club/app/rides");
  assert.equal(moved("FloMoGo.HarrisonWard.org:443", "/"), "https://flomogo.bandwagon.club/");
});

test("webhooks, API calls, and non-GET requests are never redirected", () => {
  assert.equal(moved("bandwagon.harrisonward.net", "/api/webhooks/twilio/inbound", "POST"), null);
  assert.equal(moved("bandwagon.harrisonward.net", "/api/health/ready", "GET"), null);
  assert.equal(moved("bandwagon.harrisonward.net", "/.well-known/security.txt", "GET"), null);
  assert.equal(moved("bandwagon.harrisonward.net", "/login", "POST"), null);
});

test("new hosts, custom domains, and deeper names are left alone", () => {
  assert.equal(moved("bandwagon.club"), null);
  assert.equal(moved("flomogo.bandwagon.club"), null);
  assert.equal(moved("flomogo.app"), null);
  assert.equal(moved("a.b.harrisonward.org"), null);
  assert.equal(moved("harrisonward.org"), null);
  assert.equal(moved("help.harrisonward.net"), null, "other harrisonward.net apps are not touched");
});

test("Twilio signatures validate for the new host and the old host", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/lib/twilio.ts", import.meta.url), "utf8");
  assert.match(source, /legacyPlatformHostnames\(\)/);
  assert.match(source, /candidates\.some/);
});
