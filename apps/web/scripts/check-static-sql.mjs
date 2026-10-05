// Prepares every fixed SQL string in src/ against the migrated database, so a
// query that names a missing table or column, or is not valid SQL, fails here
// instead of in production. Nothing is executed: PREPARE only parses and plans.
// Queries built with ${...} are skipped and counted.
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const { Client } = pg;
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required for db:check-sql");

const root = path.resolve(process.argv[2] || "src");
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx|mjs)$/.test(entry.name)) files.push(full);
  }
})(root);

const client = new Client({
  connectionString: url,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});
await client.connect();

let checked = 0;
let skipped = 0;
const failures = [];
try {
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/`((?:[^`\\]|\\.)*)`/gs)) {
      const sql = match[1];
      if (!/^\s*(select|insert|update|delete|with)\b/i.test(sql)) continue;
      if (!/\b(from|into|set)\b/i.test(sql)) continue;
      if (sql.includes("${")) { skipped++; continue; }
      checked++;
      const name = `static_sql_${checked}`;
      try {
        await client.query(`prepare ${name} as ${sql}`);
        await client.query(`deallocate ${name}`);
      } catch (error) {
        const line = source.slice(0, match.index).split("\n").length;
        failures.push(`${path.relative(process.cwd(), file)}:${line}  ${error.message}\n    ${sql.replace(/\s+/g, " ").trim().slice(0, 140)}`);
      }
    }
  }
} finally {
  await client.end();
}

console.log(`Static SQL check: ${checked} queries prepared, ${skipped} skipped (built with \${...}), ${failures.length} failed.`);
if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
