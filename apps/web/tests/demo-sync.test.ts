import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { WHATS_NEW } from "../src/lib/whats-new.ts";

test("the demo lists the same What's New entries as the site (run npm run demo:sync)", () => {
  const demo = JSON.parse(fs.readFileSync("../../demo/whats-new.json", "utf8"));
  assert.deepEqual(demo, JSON.parse(JSON.stringify(WHATS_NEW)), "demo/whats-new.json is out of date. Run: npm run demo:sync");
});

test("the demo ships its What's New, dark mode, and dark logo", () => {
  const docker = fs.readFileSync("../../demo/Dockerfile", "utf8");
  const html = fs.readFileSync("../../demo/index.html", "utf8");
  const css = fs.readFileSync("../../demo/styles.css", "utf8");
  for (const file of ["whats-new.json", "bandwagon-logo-dark.svg"]) {
    assert.ok(docker.includes(file), `Dockerfile copies ${file}`);
    assert.ok(fs.existsSync(`../../demo/${file}`), file);
  }
  assert.match(html, /id="whatsNewBtn"/);
  assert.match(css, /prefers-color-scheme: dark/);
  // The dark logo must match the site's.
  assert.equal(fs.readFileSync("../../demo/bandwagon-logo-dark.svg", "utf8"), fs.readFileSync("public/bandwagon-logo-dark.svg", "utf8"));
});

test("merges that touch the demo deploy it automatically", () => {
  const wf = fs.readFileSync("../../.github/workflows/deploy-demo.yml", "utf8");
  assert.match(wf, /branches: \[main\]/);
  assert.match(wf, /"demo\/\*\*"/);
  assert.match(wf, /apps\/web\/src\/lib\/whats-new\.ts/);
  assert.match(wf, /api\/v1\/deploy\?uuid=/);
  assert.match(wf, /secrets\.COOLIFY_DEPLOY_TOKEN/);
});
