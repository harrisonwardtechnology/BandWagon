import { NextResponse } from "next/server";
import { requireAdminTestToken } from "@/lib/admin-test";
import { requireBaseSessionIdentity } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime="nodejs";

export async function POST(request:Request){
  const denied=requireAdminTestToken(request);if(denied)return denied;
  try{
    const identity=await requireBaseSessionIdentity();const db=getDb();if(!db)throw new Error("Database is not configured");
    const client=await db.connect();
    try{
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtext('bandwagon:platform-owner-bootstrap'))");
      const existing=await client.query(`select 1 from user_accounts where platform_role='owner' and status='active' limit 1`);
      if(existing.rowCount){
        await client.query("rollback");
        return NextResponse.json({error:"A platform owner already exists. Additional platform roles must be granted by an existing owner."},{status:409});
      }
      const updated=await client.query(`update user_accounts set platform_role='owner',updated_at=now() where id=$1 and status='active' returning id`,[identity.userAccountId]);
      if(!updated.rowCount)throw new Error("The signed-in account is not active");
      await client.query("commit");
      return NextResponse.json({ok:true,platformRole:'owner'});
    }catch(error){
      await client.query("rollback").catch(()=>undefined);
      throw error;
    }finally{
      client.release();
    }
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to bootstrap platform owner'},{status:400});}
}
