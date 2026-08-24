import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("PWA starts in the app and caches only a public offline shell",()=>{
  const manifest=JSON.parse(fs.readFileSync("public/manifest.webmanifest","utf8"));
  const worker=fs.readFileSync("public/sw.js","utf8");
  assert.equal(manifest.start_url,"/app");
  assert.match(worker,/offline\.html/);
  assert.doesNotMatch(worker,/cache\.put/);
  assert.doesNotMatch(worker,/SHELL\s*=\s*\[[^\]]*["']\/["']/s);
  assert.match(worker,/request\.mode !== "navigate"/);
});
