import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildItems, checkUpkeep, domainItems, resetUpkeepCache, upkeepAuthorized, upkeepDomains, upkeepResponse } from "../src/lib/upkeep.ts";

const now = new Date("2026-10-08T12:00:00Z");
const TOKEN = "a".repeat(32);
const NAMES = ["APP_URL", "WATCH_DOMAINS", "GITHUB_STATUS_TOKEN", "GITHUB_REPO", "GITHUB_BRANCH", "UPKEEP_TOKEN"] as const;

// Run with the process environment set the way the test needs, then put it back. No real network is used:
// every check gets a fake getter.
async function withEnv(values: Partial<Record<(typeof NAMES)[number], string>>, run: () => Promise<void>) {
  const original = Object.fromEntries(NAMES.map((n) => [n, process.env[n]]));
  try {
    for (const n of NAMES) { if (values[n] === undefined) delete process.env[n]; else process.env[n] = values[n]; }
    resetUpkeepCache();
    await run();
  } finally {
    for (const n of NAMES) { if (original[n] === undefined) delete process.env[n]; else process.env[n] = original[n]; }
    resetUpkeepCache();
  }
}

const noNetwork = async () => { throw new Error("network not allowed in tests"); };
const rdap = (ends: Record<string, string>) => async (url: string) => {
  if (!url.startsWith("https://rdap.org/domain/")) throw new Error(`unexpected ${url}`);
  return { events: [{ eventAction: "registration", eventDate: "2020-01-01T00:00:00Z" }, { eventAction: "expiration", eventDate: ends[url.split("/").pop()!] }] };
};

test("watches the app domain plus extras, once each, cut to two labels", () => {
  assert.deepEqual(upkeepDomains("https://flomogo.bandwagon.club/x", "Bandwagon.club, flomogo.app, not a domain"), ["bandwagon.club", "flomogo.app"]);
  assert.deepEqual(upkeepDomains("http://localhost:3000", ""), []);
});

test("a domain inside a week is red, past a month is green", async () => {
  await withEnv({ APP_URL: "https://soon.club", WATCH_DOMAINS: "later.app" }, async () => {
    const items = await domainItems(now, rdap({ "soon.club": "2026-10-12T00:00:00Z", "later.app": "2027-06-01T00:00:00Z" }));
    assert.deepEqual(items.map((i) => i.state), ["bad", "ok"]);
    assert.match(items[0].detail, /3 days/);
    assert.ok(items[0].fix);
  });
});

test("a domain inside 30 days is yellow and a failed lookup is yellow", async () => {
  await withEnv({ APP_URL: "https://mid.club" }, async () => {
    assert.equal((await domainItems(now, rdap({ "mid.club": "2026-10-28T00:00:00Z" })))[0].state, "warn");
    assert.equal((await domainItems(now, noNetwork))[0].state, "warn");
  });
});

test("the build check is off without a token", async () => {
  await withEnv({}, async () => {
    const [item] = await buildItems(now, noNetwork);
    assert.equal(item.state, "warn");
    assert.match(item.detail, /off/);
  });
});

test("names billing when GitHub never started the jobs", async () => {
  await withEnv({ GITHUB_STATUS_TOKEN: "t", GITHUB_REPO: "o/r" }, async () => {
    const answers: Record<string, unknown> = {
      "/repos/o/r/actions/runs?branch=main&per_page=1": { workflow_runs: [{ id: 5, status: "completed", conclusion: "failure" }] },
      "/repos/o/r/actions/runs/5/jobs": { jobs: [{ steps: [] }, { steps: [] }] },
    };
    const get = async (url: string, h?: Record<string, string>) => {
      assert.equal(h?.Authorization, "Bearer t");
      assert.equal(h?.["X-GitHub-Api-Version"], "2022-11-28");
      return answers[url.replace("https://api.github.com", "")];
    };
    const [item] = await buildItems(now, get);
    assert.equal(item.state, "bad");
    assert.match(item.detail, /payment/);
  });
});

test("a real build failure names the branch", async () => {
  await withEnv({ GITHUB_STATUS_TOKEN: "t", GITHUB_REPO: "o/r", GITHUB_BRANCH: "release" }, async () => {
    const get = async (url: string) => url.includes("/jobs") ? { jobs: [{ steps: [{ name: "build" }] }] } : { workflow_runs: [{ id: 9, status: "completed", conclusion: "failure" }] };
    const [item] = await buildItems(now, get);
    assert.equal(item.state, "bad");
    assert.equal(item.detail, "The last build on release failed (failure).");
  });
});

test("rejects a strange repo name and warns when GitHub can't be reached", async () => {
  await withEnv({ GITHUB_STATUS_TOKEN: "t", GITHUB_REPO: "o/r?x=1" }, async () => {
    assert.equal((await buildItems(now, noNetwork))[0].state, "warn");
  });
  await withEnv({ GITHUB_STATUS_TOKEN: "t", GITHUB_REPO: "o/r" }, async () => {
    assert.equal((await buildItems(now, noNetwork))[0].state, "warn");
  });
});

test("results are cached for 6 hours", async () => {
  await withEnv({ APP_URL: "https://cache.club" }, async () => {
    let calls = 0;
    const get = async (url: string) => { calls++; return rdap({ "cache.club": "2027-06-01T00:00:00Z" })(url); };
    await checkUpkeep(now, get);
    await checkUpkeep(new Date(now.getTime() + 5 * 3_600_000), get);
    assert.equal(calls, 1);
    await checkUpkeep(new Date(now.getTime() + 7 * 3_600_000), get);
    assert.equal(calls, 2);
  });
});

test("the route is a plain 404 without the right token", async () => {
  await withEnv({ UPKEEP_TOKEN: TOKEN }, async () => {
    for (const auth of [null, "", `Bearer ${"b".repeat(32)}`, TOKEN, `Basic ${TOKEN}`]) {
      const res = await upkeepResponse(auth, now, noNetwork);
      assert.equal(res.status, 404);
      assert.equal(await res.text(), "Not Found");
    }
  });
});

test("the route stays closed when UPKEEP_TOKEN is too short or unset", async () => {
  await withEnv({ UPKEEP_TOKEN: "short" }, async () => {
    assert.equal(upkeepAuthorized("Bearer short"), false);
    assert.equal((await upkeepResponse("Bearer short", now, noNetwork)).status, 404);
  });
  await withEnv({}, async () => assert.equal((await upkeepResponse("Bearer ", now, noNetwork)).status, 404));
});

test("the route answers 200 with the token and 503 when a domain is about to lapse", async () => {
  await withEnv({ UPKEEP_TOKEN: TOKEN, APP_URL: "http://localhost:3000" }, async () => {
    const res = await upkeepResponse(`Bearer ${TOKEN}`, now, noNetwork);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.items[0].name, "Build Pipeline (GitHub)");
    assert.ok(!JSON.stringify(body).includes(TOKEN));
  });
  await withEnv({ UPKEEP_TOKEN: TOKEN, APP_URL: "https://soon.club", GITHUB_STATUS_TOKEN: "secret-gh-token" }, async () => {
    const get = async (url: string) => url.startsWith("https://rdap.org/") ? rdap({ "soon.club": "2026-10-10T00:00:00Z" })(url) : { workflow_runs: [] };
    const res = await upkeepResponse(`Bearer ${TOKEN}`, now, get);
    assert.equal(res.status, 503);
    const text = await res.text();
    assert.ok(!text.includes("secret-gh-token") && !text.includes(TOKEN));
    assert.equal(JSON.parse(text).ok, false);
  });
});

test("the route file uses the shared handler and the docs list the settings", async () => {
  const route = await readFile(new URL("../src/app/api/health/upkeep/route.ts", import.meta.url), "utf8");
  assert.match(route, /upkeepResponse\(request\.headers\.get\("authorization"\)\)/);
  for (const file of ["../../../docs/COOLIFY.md", "../../../docker-compose.coolify.example.yml", "../../../config/env.schema.example.ts"]) {
    const text = await readFile(new URL(file, import.meta.url), "utf8");
    for (const name of ["UPKEEP_TOKEN", "GITHUB_STATUS_TOKEN", "GITHUB_REPO", "GITHUB_BRANCH", "WATCH_DOMAINS"]) assert.match(text, new RegExp(name), `${file} lists ${name}`);
  }
});
