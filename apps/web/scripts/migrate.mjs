import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Client } = pg;
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required for db:migrate");
const useSsl = process.env.DATABASE_SSL === "true";
const client = new Client({ connectionString: url, ssl: useSsl ? { rejectUnauthorized: false } : undefined });
await client.connect();
try {
  const dir = path.resolve("database/migrations");
  const files = (await fs.readdir(dir)).filter(f => f.endsWith(".sql")).sort();
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  for (const filename of files) {
    const exists = await client.query("SELECT 1 FROM schema_migrations WHERE filename=$1", [filename]);
    if (exists.rowCount) continue;
    const sql = await fs.readFile(path.join(dir, filename), "utf8");
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations(filename) VALUES($1)", [filename]);
    console.log(`Applied ${filename}`);
  }
} finally {
  await client.end();
}
