import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { WHATS_NEW, whatsNewEntries } from "../src/lib/whats-new.ts";

test("What's New entries are dated, newest first, and written in plain sentences", () => {
  assert.ok(WHATS_NEW.length >= 1);
  const sorted = whatsNewEntries();
  assert.deepEqual(sorted.map((entry) => entry.date), [...WHATS_NEW.map((entry) => entry.date)].sort().reverse());
  const dates = new Set<string>();
  for (const entry of sorted) {
    assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!Number.isNaN(Date.parse(entry.date)), entry.date);
    assert.ok(!dates.has(entry.date), `duplicate date ${entry.date}`);
    dates.add(entry.date);
    assert.ok(entry.title.length > 3 && entry.title.length <= 60, entry.title);
    assert.ok(entry.items.length >= 1 && entry.items.length <= 8, `${entry.date} should have 1 to 8 items`);
    for (const item of entry.items) {
      assert.match(item, /[.!?]$/, `"${item}" should be a full sentence`);
      assert.doesNotMatch(item, /\b(PR|#\d+|migration|refactor|API|endpoint)\b/, `"${item}" should avoid developer words`);
    }
    assert.match(entry.displayDate, /^[A-Z][a-z]+ \d{1,2}, \d{4}$/);
  }
});

test("What's New is a public page, linked in the footer and listed for search", () => {
  const page = fs.readFileSync("src/app/whats-new/page.tsx", "utf8");
  const layout = fs.readFileSync("src/app/layout.tsx", "utf8");
  const seo = fs.readFileSync("src/lib/seo-policy.ts", "utf8");
  assert.match(page, /publicPageMetadata/);
  assert.match(layout, /href="\/whats-new"/);
  assert.match(seo, /"\/whats-new"/);
});

test("password managers are sent to the sign-in security page", () => {
  const config = fs.readFileSync("next.config.ts", "utf8");
  assert.match(config, /source: "\/\.well-known\/change-password", destination: "\/app\/settings\/security", permanent: false/);
});
