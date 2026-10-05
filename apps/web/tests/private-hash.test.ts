import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { PRIVATE_HASH_SECRET_ERROR, privateHashConfigured, privateHashSecret, privateHmac } from "../src/lib/private-hash.ts";

const AUTH = "unit-test-auth-secret-with-at-least-32-characters";
const DATA = "unit-test-data-encryption-key-with-32-characters";

// Run a check with the process environment set the way the test needs, then put it back.
function withEnv(values: { AUTH_SECRET?: string; DATA_ENCRYPTION_KEY?: string }, run: () => void) {
  const original = { auth: process.env.AUTH_SECRET, data: process.env.DATA_ENCRYPTION_KEY };
  try {
    for (const name of ["AUTH_SECRET", "DATA_ENCRYPTION_KEY"] as const) {
      if (values[name] === undefined) delete process.env[name];
      else process.env[name] = values[name];
    }
    run();
  } finally {
    if (original.auth === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = original.auth;
    if (original.data === undefined) delete process.env.DATA_ENCRYPTION_KEY; else process.env.DATA_ENCRYPTION_KEY = original.data;
  }
}

test("private hashing fails closed when no key is configured", () => {
  withEnv({}, () => {
    assert.equal(privateHashConfigured(), false);
    assert.throws(() => privateHashSecret(), new RegExp(PRIVATE_HASH_SECRET_ERROR));
    assert.throws(() => privateHmac("203.0.113.9"), /AUTH_SECRET or DATA_ENCRYPTION_KEY is required/);
  });
  // Blank values count as not set.
  withEnv({ AUTH_SECRET: "", DATA_ENCRYPTION_KEY: "   " }, () => {
    assert.equal(privateHashConfigured(), false);
    assert.throws(() => privateHmac("203.0.113.9"), /is required/);
  });
});

test("private hashing uses AUTH_SECRET first, then DATA_ENCRYPTION_KEY, exactly as before", () => {
  const expected = (secret: string) => crypto.createHmac("sha256", secret).update("203.0.113.9").digest("hex");
  withEnv({ AUTH_SECRET: AUTH, DATA_ENCRYPTION_KEY: DATA }, () => {
    assert.equal(privateHashConfigured(), true);
    assert.equal(privateHashSecret(), AUTH);
    assert.equal(privateHmac("203.0.113.9"), expected(AUTH));
  });
  withEnv({ DATA_ENCRYPTION_KEY: DATA }, () => {
    assert.equal(privateHashSecret(), DATA);
    assert.equal(privateHmac("203.0.113.9"), expected(DATA));
  });
  // Never the old built-in strings.
  for (const old of ["bandwagon-feature-request-rate-limit", "bandwagon-organization-requests", "bandwagon-routing-cache-development"]) {
    withEnv({ AUTH_SECRET: AUTH }, () => assert.notEqual(privateHmac("203.0.113.9"), expected(old)));
  }
});

async function sourceFiles(dir: URL): Promise<URL[]> {
  const out: URL[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir);
    if (entry.isDirectory()) out.push(...(await sourceFiles(url)));
    else if (/\.(tsx?|mjs)$/.test(entry.name)) out.push(url);
  }
  return out;
}

test("no source file falls back to a fixed string when the secrets are unset", async () => {
  const offenders: string[] = [];
  const files = [...(await sourceFiles(new URL("../src/", import.meta.url))), ...(await sourceFiles(new URL("../scripts/", import.meta.url)))];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    // process.env.AUTH_SECRET || process.env.DATA_ENCRYPTION_KEY || "some-built-in-key"
    if (/process\.env\.(AUTH_SECRET|DATA_ENCRYPTION_KEY|LOOKUP_HASH_KEY)\s*\|\|\s*["'`]/.test(source)) offenders.push(file.pathname.split("/apps/web/")[1]);
  }
  assert.deepEqual(offenders, []);
});

test("feature requests, organization requests, and the routing cache use the shared fail-closed helper", async () => {
  for (const file of ["../src/lib/feature-requests.ts", "../src/lib/organization-requests.ts", "../src/lib/routing-provider.ts"]) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.match(source, /import \{ privateHmac \} from "@\/lib\/private-hash";/, file);
    assert.match(source, /privateHmac\(/, file);
    assert.doesNotMatch(source, /createHmac/, file);
  }
});

test("public routes refuse instead of skipping a rate limit when no hash key is set", async () => {
  // These rate limits are wrapped in catch handlers that allow the request, so the key is checked first.
  for (const file of [
    "../src/app/api/feature-requests/route.ts",
    "../src/app/api/organization-requests/route.ts",
    "../src/app/api/security/report/route.ts",
    "../src/app/api/help/contact/route.ts",
    "../src/app/api/support/checkout/route.ts",
    "../src/app/api/client-errors/route.ts",
  ]) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.match(source, /privateHashConfigured\(\)/, file);
    assert.doesNotMatch(source, /createHmac/, file);
  }
});
