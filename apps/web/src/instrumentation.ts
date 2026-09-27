import type { Instrumentation } from "next";
import { redactApplicationErrorText } from "@/lib/error-monitoring-policy";

// APP_ROLE=web      -> serve pages and API only
// APP_ROLE=worker   -> run the background worker (it still answers /api/health/*)
// APP_ROLE=all      -> both, for single-container installs (default)
export async function register() {
  // This exact check lets Next drop the Node-only worker from the edge bundle.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}

export const onRequestError:Instrumentation.onRequestError=async(error,request,context)=>{
  const baseUrl=process.env.APP_URL,secret=process.env.ERROR_MONITOR_INGEST_SECRET;
  if(request.path==="/api/internal/error-monitor")return;
  if(!baseUrl||!secret){
    // No local error store configured: still send to GlitchTip if it is set up.
    if(process.env.NEXT_RUNTIME==="nodejs"&&process.env.GLITCHTIP_DSN){
      const {reportErrorToGlitchTip}=await import("./lib/glitchtip");
      reportErrorToGlitchTip(error,{source:"server",route:request.path,method:request.method,tags:{router:context.routerKind,route_type:context.routeType}});
    }
    return;
  }
  const source=error instanceof Error?error:new Error(typeof error==="string"?error:"Unknown application error");
  await fetch(new URL("/api/internal/error-monitor",baseUrl),{method:"POST",headers:{authorization:`Bearer ${secret}`,"content-type":"application/json"},body:JSON.stringify({name:String(source.name||"Error").slice(0,120),message:redactApplicationErrorText(String(source.message||"Application error")).slice(0,1000),stack:source.stack?redactApplicationErrorText(source.stack).slice(0,6000):null,routePath:redactApplicationErrorText(request.path).slice(0,500),method:request.method,routerKind:context.routerKind,routeType:context.routeType}),cache:"no-store"}).catch(()=>{});
};
