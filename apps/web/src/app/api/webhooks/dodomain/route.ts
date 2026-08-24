import { processDoDomainWebhook } from "@/lib/dodomain-webhook";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function POST(request:Request){
  const rawBody=await request.text();
  const signature=request.headers.get("x-dodomain-signature")||"";
  try{
    const result=await processDoDomainWebhook(rawBody,signature);
    return Response.json({ok:true,...result});
  }catch(error){
    const message=error instanceof Error?error.message:"Unable to process DoDomain webhook";
    const status=message.includes("signature")?403:400;
    return Response.json({error:message},{status});
  }
}
