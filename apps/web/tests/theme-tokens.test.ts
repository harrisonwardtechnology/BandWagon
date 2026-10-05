import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

// Dark mode works because pages take their neutral colors from the theme
// tokens in globals.css (var(--surface), var(--text), var(--line) and so on).
// A hard-coded neutral in a page would look fine in light mode and break in
// dark, so this guard fails on the old hex values in inline styles.

const ROOTS = ["src/app", "src/components"];
// Files that draw fixed-color images, where theme tokens do not apply.
const SKIP = new Set(["og-card.tsx", "opengraph-image.tsx", "twitter-image.tsx"]);
// Neutrals that must come from a token instead.
const TEXT = ["#64748b", "#475569", "#334155", "#101b33", "#0f172a", "#5b6a7e"];
const SURFACE = ["#fff", "#ffffff", "white", "#f8fafc", "#f1f5f9", "#e2e8f0", "#101b33"];
const LINE = ["#cbd5e1", "#dbe3ef", "#e2e8f0", "#e5e7eb", "#eef2f7"];

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsxFiles(full));
    else if (entry.name.endsWith(".tsx") && !SKIP.has(entry.name)) out.push(full);
  }
  return out;
}

function violations(source: string, file: string) {
  const found: string[] = [];
  const check = (props: string, values: string[]) => {
    const re = new RegExp(`\\b(${props})\\s*:\\s*([^,}\\n]*)`, "g");
    for (const match of source.matchAll(re)) {
      for (const literal of match[2].matchAll(/["'`]([^"'`]*)["'`]/g)) {
        const value = literal[1].toLowerCase();
        for (const bad of values) {
          const hit = bad.startsWith("#") ? new RegExp(`${bad}\\b`).test(value) : value.trim() === bad;
          if (hit) {
            const line = source.slice(0, match.index).split("\n").length;
            found.push(`${file}:${line} ${match[1]}: ${literal[0]}`);
          }
        }
      }
    }
  };
  check("color", TEXT);
  check("background|backgroundColor", SURFACE);
  check("border|borderTop|borderBottom|borderLeft|borderRight|borderColor", LINE);
  return found;
}

test("page styles take neutral colors from theme tokens", () => {
  const found = ROOTS.flatMap(tsxFiles).flatMap(file => violations(fs.readFileSync(file, "utf8"), file));
  assert.deepEqual(found, [], `Use a theme token (see globals.css) instead of a fixed color:\n${found.join("\n")}`);
});

test("the guard catches a hard-coded neutral", () => {
  assert.equal(violations(`const card = { background: "white", color: "#64748b", border: "1px solid #cbd5e1" };`, "x.tsx").length, 3);
  assert.equal(violations(`const card = { background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--line-strong)" };`, "x.tsx").length, 0);
  // White text on a solid color is fine; only white as a surface is flagged.
  assert.equal(violations(`const danger = { background: "#b91c1c", color: "white" };`, "x.tsx").length, 0);
});

test("stylesheet defines light and dark tokens and follows the device setting", () => {
  const css = fs.readFileSync("src/app/globals.css", "utf8");
  assert.match(css, /color-scheme:\s*light dark/);
  const dark = css.match(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([\s\S]*?)\}\s*\}/);
  assert.ok(dark, "dark token block not found");
  const light = css.slice(css.indexOf(":root {"), css.indexOf("@media (prefers-color-scheme: dark)"));
  for (const token of ["--bg", "--surface", "--surface-2", "--surface-3", "--text", "--text-2", "--text-3", "--text-muted", "--line", "--line-strong", "--btn-solid", "--on-btn-solid", "--panel-solid", "--bg-warn", "--bg-danger", "--bg-info", "--bg-success"]) {
    assert.match(light, new RegExp(`${token}:`), `light token ${token}`);
    assert.match(dark[1], new RegExp(`${token}:`), `dark token ${token}`);
  }
  // System font only: no web font is named or loaded.
  assert.match(css, /font-family:\s*system-ui/);
  assert.doesNotMatch(css, /Inter\b/);
});

test("pickup check colors stay fixed so both phones match in any theme", () => {
  const verify = fs.readFileSync("src/app/app/rides/verify/page.tsx", "utf8");
  assert.match(verify, /color:"#071a33",background:h\.phraseColor/);
  assert.doesNotMatch(verify, /background:h\.phraseColor[^}]*var\(--/);
});

test("shell has the dark logo, state screens, touch targets and the footer credit", () => {
  const css = fs.readFileSync("src/app/globals.css", "utf8");
  const layout = fs.readFileSync("src/app/layout.tsx", "utf8");
  const logo = fs.readFileSync("src/components/brand-logo.tsx", "utf8");
  assert.match(logo, /bandwagon-logo-dark\.svg/);
  assert.match(logo, /prefers-color-scheme: dark/);
  assert.ok(fs.existsSync("public/bandwagon-logo-dark.svg"));
  assert.match(css, /min-height:\s*44px/);
  assert.match(layout, /Built By <a href="https:\/\/harrisonward\.com\/"/);
  assert.match(layout, /prefers-color-scheme: dark/);
  for (const file of ["src/app/not-found.tsx", "src/app/error.tsx", "src/app/global-error.tsx", "src/app/app/loading.tsx", "src/app/admin/loading.tsx"]) {
    assert.ok(fs.existsSync(file), file);
  }
  // No root loading screen: it would make public pages stream and lose real 404 status codes.
  assert.equal(fs.existsSync("src/app/loading.tsx"), false);
});

test("install icons are split by purpose", () => {
  const manifest = JSON.parse(fs.readFileSync("public/manifest.webmanifest", "utf8"));
  const purposes = manifest.icons.map((icon: { purpose: string }) => icon.purpose).sort();
  assert.deepEqual(purposes, ["any", "any", "maskable", "maskable"]);
  for (const icon of manifest.icons) assert.ok(fs.existsSync(path.join("public", icon.src)), icon.src);
});
