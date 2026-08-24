import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(){
  const started=Date.now();
  const checks:{database:{ok:boolean;latencyMs:number|null};encryptionKey:boolean}={database:{ok:false,latencyMs:null},encryptionKey:Boolean(process.env.DATA_ENCRYPTION_KEY)};
  const db=getDb();
  if(db){
    try{const t=Date.now();await db.query("select 1");checks.database={ok:true,latencyMs:Date.now()-t};}catch{}
  }
  const ready=checks.database.ok&&checks.encryptionKey;
  return Response.json({ok:ready,status:ready?"ready":"not_ready",service:"bandwagon-web",checks,durationMs:Date.now()-started,timestamp:new Date().toISOString()},{status:ready?200:503,headers:{"cache-control":"no-store"}});
}
