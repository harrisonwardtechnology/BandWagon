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
