import { getDb } from "@/lib/db";
import { recordHeartbeat } from "@/lib/platform-health";

type CronResult = Record<string, unknown> | unknown;

function compactResult(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (["token", "secret", "password", "authorization", "accessToken", "refreshToken"].some((part) => key.toLowerCase().includes(part.toLowerCase()))) continue;
    if (["string", "number", "boolean"].includes(typeof item) || item == null) result[key] = item;
    if (Object.keys(result).length >= 12) break;
  }
  return result;
}

export async function runCronWithHeartbeat<T extends CronResult>(input: {
  key: string;
  expectedMaxAgeMinutes: number;
  run: () => Promise<T>;
}) {
  const db = getDb();
  const started = Date.now();
  if (db) {
    await db.query(
      `insert into platform_health_heartbeats(component_key,component_type,status,last_started_at,metadata,updated_at)
       values($1,'cron','unknown',now(),$2::jsonb,now())
       on conflict(component_key) do update set
         component_type='cron',last_started_at=now(),metadata=platform_health_heartbeats.metadata||excluded.metadata,updated_at=now()`,
      [input.key, JSON.stringify({ expectedMaxAgeMinutes: input.expectedMaxAgeMinutes })]
    ).catch(() => {});
  }
  try {
    const result = await input.run();
    await recordHeartbeat({
      key: input.key,
      type: "cron",
      ok: true,
      durationMs: Date.now() - started,
      metadata: { expectedMaxAgeMinutes: input.expectedMaxAgeMinutes, result: compactResult(result) },
    }).catch(() => {});
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scheduled job failed";
    await recordHeartbeat({
      key: input.key,
      type: "cron",
      ok: false,
      durationMs: Date.now() - started,
      error: message,
      metadata: { expectedMaxAgeMinutes: input.expectedMaxAgeMinutes },
    }).catch(() => {});
    throw error;
  }
}
