import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// nginx inherits add_header from the server level only when a location has no
// add_header of its own. A location that adds Cache-Control drops every
// server-level security header unless it repeats them.

const SECURITY_HEADERS = [
  "X-Content-Type-Options",
  "Referrer-Policy",
  "X-Frame-Options",
  "Strict-Transport-Security",
  "Permissions-Policy",
] as const;

function headerValues(block: string) {
  const values = new Map<string, string>();
  for (const match of block.matchAll(/add_header\s+([\w-]+)\s+"([^"]*)"([^;]*);/g)) values.set(match[1], `${match[2]}|${match[3].trim()}`);
  return values;
}

async function demoConfig() {
  const conf = await readFile(new URL("../../../demo/nginx.conf", import.meta.url), "utf8");
  // Anchored to the start of a line so the word "location" in a comment is not picked up.
  const locations = [...conf.matchAll(/^[ \t]*location\s+([^{\n]+)\{([^}]*)\}/gm)].map((match) => ({ name: match[1].trim(), body: match[2] }));
  const serverLevel = conf.replace(/^[ \t]*location\s+[^{\n]+\{[^}]*\}/gm, "");
  return { conf, locations, serverLevel };
}

test("demo nginx sets every security header at the server level", async () => {
  const { serverLevel } = await demoConfig();
  const headers = headerValues(serverLevel);
  for (const name of SECURITY_HEADERS) {
    assert.ok(headers.has(name), `${name} is missing at the server level`);
    assert.match(headers.get(name)!, /\|always$/, `${name} must use "always" so error pages get it too`);
  }
});

test("demo nginx locations that add their own headers repeat every security header", async () => {
  const { locations, serverLevel } = await demoConfig();
  const expected = headerValues(serverLevel);
  assert.ok(locations.length >= 6, "expected the demo locations to be parsed");
  const withOwnHeaders = locations.filter((location) => /add_header/.test(location.body));
  assert.ok(withOwnHeaders.length >= 5, "the page, service worker, manifest, and asset locations add Cache-Control");
  for (const location of withOwnHeaders) {
    const headers = headerValues(location.body);
    for (const name of SECURITY_HEADERS) {
      assert.ok(headers.has(name), `location ${location.name} drops ${name}`);
      assert.equal(headers.get(name), expected.get(name), `location ${location.name} sets a different ${name} than the server level`);
    }
  }
});

test("demo Dockerfile still ships the nginx config it is built with", async () => {
  const dockerfile = await readFile(new URL("../../../demo/Dockerfile", import.meta.url), "utf8");
  assert.match(dockerfile, /COPY nginx\.conf \/etc\/nginx\/conf\.d\/default\.conf/);
  const { conf } = await demoConfig();
  // No include files: everything the image needs is in the one file the Dockerfile copies.
  assert.doesNotMatch(conf, /^\s*include\s/m);
});
