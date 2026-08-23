import crypto from "node:crypto";
import { processCredentialExpirations } from "@/lib/credential-expiration";

export const runtime="nodejs";
export const maxDuration=60;

function valid(request:Request){
  const configured=process.env.SAFETY_CRON_SECRET;if(!configured)return false;
  const supplied=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"")||"";
  const a=Buffer.from(configured);const b=Buffer.from(supplied);return a.length===b.length&&crypto.timingSafeEqual(a,b);
}

export async function POST(request:Request){
  if(!valid(request))return new Response("Unauthorized",{status:401});
  try{return Response.json({ok:true,...await processCredentialExpirations()});}
  catch(error){return Response.json({ok:false,error:error instanceof Error?error.message:"Safety maintenance failed"},{status:500});}
}
