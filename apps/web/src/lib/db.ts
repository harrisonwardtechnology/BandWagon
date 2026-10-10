import { Pool } from "pg";
import { env } from "./env";

let pool: Pool | undefined;

export function getDb() {
  if (!env.DATABASE_URL) return undefined;
  if (!pool) {
    // With a CA configured the server certificate is verified. Without one we
    // still encrypt the connection but cannot detect a man-in-the-middle, so
    // DATABASE_CA should be set for any database reached over a shared network.
    const ssl = !env.DATABASE_SSL
      ? undefined
      : env.DATABASE_CA
        ? { ca: env.DATABASE_CA, rejectUnauthorized: true }
        : { rejectUnauthorized: false };
    pool = new Pool({ connectionString: env.DATABASE_URL, max: 10, ssl });
    // An idle client error (server restart, network blip) is emitted on the
    // pool. Without a listener Node treats it as unhandled and exits.
    pool.on("error", (error) => {
      console.error("PostgreSQL pool error", { message: error.message });
    });
  }
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
