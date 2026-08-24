export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(){
  return Response.json({ok:true,status:"alive",service:"bandwagon-web",timestamp:new Date().toISOString()},{status:200,headers:{"cache-control":"no-store"}});
}
