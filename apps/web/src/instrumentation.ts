import type { Instrumentation } from "next";
import { redactApplicationErrorText } from "@/lib/error-monitoring-policy";

export const onRequestError:Instrumentation.onRequestError=async(error,request,context)=>{
  const baseUrl=process.env.APP_URL,secret=process.env.ERROR_MONITOR_INGEST_SECRET;
  if(!baseUrl||!secret||request.path==="/api/internal/error-monitor")return;
  const source=error instanceof Error?error:new Error(typeof error==="string"?error:"Unknown application error");
  await fetch(new URL("/api/internal/error-monitor",baseUrl),{method:"POST",headers:{authorization:`Bearer ${secret}`,"content-type":"application/json"},body:JSON.stringify({name:String(source.name||"Error").slice(0,120),message:redactApplicationErrorText(String(source.message||"Application error")).slice(0,1000),stack:source.stack?redactApplicationErrorText(source.stack).slice(0,6000):null,routePath:redactApplicationErrorText(request.path).slice(0,500),method:request.method,routerKind:context.routerKind,routeType:context.routeType}),cache:"no-store"}).catch(()=>{});
};
