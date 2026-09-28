import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

// Short UI text (form labels and buttons) uses Title Case with every word
// capitalized, e.g. "Sign In With A Passkey". This guard only inspects literal
// JSX text that sits directly inside a <label> or <button>; expressions and
// nested elements are skipped to avoid false positives, and so is literal text
// that reads as a full sentence (ending in . ? or !).

const ROOTS = ["src/app", "src/components"];
const TAGS = new Set(["label", "button"]);
// Words that intentionally stay lowercase (units, abbreviations, brands).
const ALLOWED_LOWERCASE = new Set(["e.g.", "i.e.", "km", "mi", "min", "vs", "iOS", "eBay"]);

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsxFiles(full));
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

function lowercaseWords(text: string): string[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => {
      if (ALLOWED_LOWERCASE.has(word)) return false;
      if (word.startsWith("&")) return false; // HTML entities such as &apos;s
      const letters = word.replace(/^[^\p{L}]+/u, "");
      if (!letters || ALLOWED_LOWERCASE.has(letters.replace(/[^\p{L}.]+$/u, ""))) return false;
      return /^\p{Ll}/u.test(letters);
    });
}

function findViolations(file: string): string[] {
  const source = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node)) {
      const tag = node.openingElement.tagName.getText(sf);
      if (TAGS.has(tag)) {
        for (const child of node.children) {
          if (!ts.isJsxText(child)) continue;
          const text = child.getText(sf).replace(/\s+/g, " ").trim();
          if (!text) continue;
          // Full sentences and questions (e.g. "What happened?") are copy, not titles.
          if (/[.?!]$/.test(text) && !/\.\.\.$|…$/.test(text)) continue;
          const bad = lowercaseWords(text);
          if (bad.length) {
            const line = sf.getLineAndCharacterOfPosition(child.getStart(sf)).line + 1;
            violations.push(`${file}:${line} <${tag}> "${text}" (${bad.join(", ")})`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return violations;
}

test("label and button literal text uses Title Case for every word", () => {
  const files = ROOTS.flatMap((root) => tsxFiles(root));
  assert.ok(files.length > 20, "expected to scan app and component files");
  const violations = files.flatMap(findViolations);
  assert.deepEqual(violations, [], `Use Title Case in labels and buttons:\n${violations.join("\n")}`);
});

test("title case guard flags lowercase words and allows exceptions", () => {
  assert.deepEqual(lowercaseWords("Sign in with a Passkey"), ["in", "with", "a"]);
  assert.deepEqual(lowercaseWords("Sign In With A Passkey"), []);
  assert.deepEqual(lowercaseWords("Email (Optional)"), []);
  assert.deepEqual(lowercaseWords("Radius km"), []);
  assert.deepEqual(lowercaseWords("Accept &apos;s Offer"), []);
  assert.deepEqual(lowercaseWords("Email (optional)"), ["(optional)"]);
});
