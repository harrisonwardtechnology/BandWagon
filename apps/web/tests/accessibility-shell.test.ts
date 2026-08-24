import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("application shell provides keyboard and status accessibility primitives",()=>{
  const layout=fs.readFileSync("src/app/layout.tsx","utf8");
  const css=fs.readFileSync("src/app/globals.css","utf8");
  const nav=fs.readFileSync("src/components/app-nav.tsx","utf8");
  const offline=fs.readFileSync("src/app/OfflineStatus.tsx","utf8");
  assert.match(layout,/href="#main-content"/);
  assert.match(layout,/id="main-content"/);
  assert.match(css,/:focus-visible/);
  assert.match(css,/prefers-reduced-motion/);
  assert.match(nav,/aria-label="Application"/);
  assert.match(nav,/aria-current=/);
  assert.match(offline,/aria-live="polite"/);
});
