import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

// Postgres rejects one parameter used as both uuid and text ("inconsistent
// types deduced for parameter"). The common trap is audit_events, where
// organization_id / actor_person_id are uuid but target_id is text. Any insert
// that feeds the same $N into target_id and another column must cast it.

async function sourceFiles(dir: URL): Promise<URL[]> {
  const out: URL[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir);
    if (entry.isDirectory()) out.push(...(await sourceFiles(url)));
    else if (/\.tsx?$/.test(entry.name)) out.push(url);
  }
  return out;
}

test("inserts never feed one uncast parameter into target_id and another column", async () => {
  const offenders: string[] = [];
  for (const file of await sourceFiles(new URL("../src/", import.meta.url))) {
    const source = await readFile(file, "utf8");
    const pattern = /insert\s+into\s+(\w+)\s*\(([^)]*)\)\s*values\s*\(([^)]*)\)/gi;
    for (const match of source.matchAll(pattern)) {
      const columns = match[2].split(",").map((c) => c.trim());
      const values = match[3].split(/,(?![^(]*\))/).map((v) => v.trim());
      const byParam = new Map<string, string[]>();
      columns.forEach((column, i) => {
        const value = values[i];
        if (value && /^\$\d+$/.test(value)) byParam.set(value, [...(byParam.get(value) || []), column]);
      });
      for (const [param, cols] of byParam) {
        if (cols.length > 1 && cols.includes("target_id")) offenders.push(`${file.pathname.split("/src/")[1]}: ${match[1]} ${param} -> ${cols.join(", ")}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});
