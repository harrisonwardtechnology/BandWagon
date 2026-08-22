import { Pool } from "pg";
import { env } from "./env";

let pool: Pool | undefined;

export function getDb() {
  if (!env.DATABASE_URL) return undefined;
  pool ??= new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined
  });
  return pool;
}

export async function checkDatabase() {
  const db = getDb();
  if (!db) return { configured: false, ok: !env.HEALTH_REQUIRE_DATABASE };
  try {
    const result = await db.query("select 1 as ok");
    return { configured: true, ok: result.rows[0]?.ok === 1 };
  } catch (error) {
    return { configured: true, ok: false, error: error instanceof Error ? error.message : "database error" };
  }
}
