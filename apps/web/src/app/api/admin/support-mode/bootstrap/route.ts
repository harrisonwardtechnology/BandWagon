import { NextResponse } from "next/server";
import { requireAdminTestToken } from "@/lib/admin-test";
import { requireBaseSessionIdentity } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime="nodejs";

export async function POST(request:Request){
  const denied=requireAdminTestToken(request);if(denied)return denied;
  try{
    const identity=await requireBaseSessionIdentity();const db=getDb();if(!db)throw new Error("Database is not configured");
    const existing=await db.query(`select 1 from user_accounts where platform_role='owner' and status='active' limit 1`);
    if(existing.rowCount)return NextResponse.json({error:"A platform owner already exists. Additional platform roles must be granted by an existing owner."},{status:409});
    await db.query(`update user_accounts set platform_role='owner',updated_at=now() where id=$1`,[identity.userAccountId]);
    return NextResponse.json({ok:true,platformRole:'owner'});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to bootstrap platform owner'},{status:400});}
}
