import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

// These guard three queries that were broken on main and only failed at run
// time. The full check (every fixed query prepared against the real schema) is
// `npm run db:check-sql`, which CI runs after migrations.

test("safety context query selects the column it sorts by", () => {
  const source = fs.readFileSync("src/lib/safety.ts", "utf8");
  const query = source.match(/select distinct r\.id[\s\S]*?order by r\.created_at desc limit 25/);
  assert.ok(query, "safety context query not found");
  const selectList = query[0].split(/\bfrom rides r\b/)[0];
  assert.match(selectList, /r\.created_at/, "SELECT DISTINCT must select r.created_at to ORDER BY it");
});

test("safety page load failures are not reported as signed out", () => {
  const route = fs.readFileSync("src/app/api/safety/route.ts", "utf8");
  const get = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
  assert.match(get, /status:401/);
  assert.match(get, /status:500/);
  // The database error text must not be sent to the browser.
  assert.doesNotMatch(get, /error\.message[^\n]*status:(401|500)/);
});

test("pickup verification adoption reads the real handshake table", () => {
  const source = fs.readFileSync("src/lib/platform-analytics.ts", "utf8");
  assert.doesNotMatch(source, /pickup_verification_sessions/);
  assert.match(source, /from ride_pickup_handshakes/);
});

test("CI prepares static SQL against the migrated schema", () => {
  const workflow = fs.readFileSync("../../.github/workflows/web-build.yml", "utf8");
  assert.match(workflow, /npm run db:check-sql/);
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.equal(pkg.scripts["db:check-sql"], "node scripts/check-static-sql.mjs");
});
