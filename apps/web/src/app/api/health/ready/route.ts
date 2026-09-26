import { getDb } from "@/lib/db";
import { checkRedis } from "@/lib/redis";
import { parseAppRole } from "@/lib/job-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(){
  const started=Date.now();
  const checks:{database:{ok:boolean;latencyMs:number|null};encryptionKey:boolean}={database:{ok:false,latencyMs:null},encryptionKey:Boolean(process.env.DATA_ENCRYPTION_KEY)};
  const db=getDb();
  if(db){
    try{const t=Date.now();await db.query("select 1");checks.database={ok:true,latencyMs:Date.now()-t};}catch{}
  }
  // Rate limits and webhook dedupe live in Redis. With HEALTH_REQUIRE_REDIS=true an
  // instance that cannot reach Redis leaves the load balancer; otherwise it stays in
  // (limits fail open) and /api/health/deep reports the problem.
  const redis=await Promise.race([checkRedis(),new Promise<{configured:boolean;ok:boolean}>(r=>setTimeout(()=>r({configured:true,ok:false}),2000))]);
  const redisRequired=String(process.env.HEALTH_REQUIRE_REDIS||'').toLowerCase()==='true';
  const ready=checks.database.ok&&checks.encryptionKey&&(redis.ok||!redisRequired);
  const role=parseAppRole(process.env.APP_ROLE);
  return Response.json({ok:ready,status:ready?"ready":"not_ready",service:`bandwagon-${role}`,role,checks:{...checks,redis:{configured:redis.configured,ok:redis.ok}},durationMs:Date.now()-started,timestamp:new Date().toISOString()},{status:ready?200:503,headers:{"cache-control":"no-store"}});
}
