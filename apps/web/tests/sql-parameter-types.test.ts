import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

// Postgres rejects one parameter used as both uuid and text ("inconsistent types
// deduced for parameter"). Audit inserts that reuse $1 for the id column and
// target_id must cast both uses explicitly.
test("audit inserts never reuse an uncast parameter for uuid and text columns", async () => {
  const dir = new URL("../src/lib/", import.meta.url);
  const offenders: string[] = [];
  for (const name of await readdir(dir)) {
    if (!name.endsWith(".ts")) continue;
    const source = await readFile(new URL(name, dir), "utf8");
    const pattern = /values\s*\(\s*\$(\d)\s*,\s*'[^']*'\s*,\s*'[^']*'\s*,\s*\$\1\s*[,)]/g;
    for (const match of source.matchAll(pattern)) offenders.push(`${name}: ${match[0]}`);
  }
  assert.deepEqual(offenders, []);
});
