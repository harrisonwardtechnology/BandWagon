import Redis from "ioredis";
import { env } from "./env";

let redis: Redis | undefined;

export function getRedis() {
  if (!env.REDIS_URL) return undefined;
  if (!redis) {
    redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    // ioredis emits connection errors as events; an unhandled one crashes the process.
    redis.on("error", (error) => {
      console.error("Redis error", { message: error.message });
    });
  }
  return redis;
}

export async function checkRedis() {
  const client = getRedis();
  if (!client) return { configured: false, ok: !env.HEALTH_REQUIRE_REDIS };
  try {
    if (client.status === "wait") await client.connect();
    const pong = await client.ping();
    return { configured: true, ok: pong === "PONG" };
  } catch (error) {
    return { configured: true, ok: false, error: error instanceof Error ? error.message : "redis error" };
  }
}
