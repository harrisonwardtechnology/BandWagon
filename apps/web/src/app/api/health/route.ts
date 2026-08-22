import { NextResponse } from "next/server";
import { checkDatabase } from "@/lib/db";
import { checkRedis } from "@/lib/redis";
import { env, assertProductionSafety } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    assertProductionSafety();
    const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);
    const ok = database.ok && redis.ok;
    return NextResponse.json({
      status: ok ? "ok" : "degraded",
      service: env.APP_NAME,
      timestamp: new Date().toISOString(),
      dependencies: { database, redis }
    }, { status: ok ? 200 : 503 });
  } catch (error) {
    return NextResponse.json({ status: "error", error: error instanceof Error ? error.message : "unknown error" }, { status: 503 });
  }
}
