import { recordApplicationError } from "@/lib/error-monitoring";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function POST(request:Request){
  const configured=process.env.ERROR_MONITOR_INGEST_SECRET;
  if(!configured||request.headers.get("authorization")!==`Bearer ${configured}`)return Response.json({error:"Unauthorized"},{status:401,headers:{"cache-control":"no-store"}});
  try{
    const body=await request.json().catch(()=>({}));
    const error=new Error(String(body.message||"Application error"));
    error.name=String(body.name||"Error").slice(0,120);
    if(body.stack)error.stack=String(body.stack).slice(0,6000);
    await recordApplicationError(error,{routePath:String(body.routePath||"unknown"),method:body.method?String(body.method):null,routerKind:body.routerKind?String(body.routerKind):null,routeType:body.routeType?String(body.routeType):null});
    return Response.json({ok:true},{status:202,headers:{"cache-control":"no-store"}});
  }catch{return Response.json({error:"Error report was not accepted"},{status:400,headers:{"cache-control":"no-store"}});}
}
