type DoDomainCheck = { domain?: string; zone?: string; provider?: string; nameservers?: string[] };
type DoDomainSession = { id?: string; token?: string; connectUrl?: string; domain?: string; records?: unknown[]; warnings?: unknown[] };

function configured(){return Boolean(process.env.DODOMAIN_SECRET_KEY);}
function apiBase(){return (process.env.DODOMAIN_API_BASE_URL||"https://app.dodomain.io").replace(/\/$/,"");}

async function request<T>(path:string,init:RequestInit={}){
  const key=process.env.DODOMAIN_SECRET_KEY;if(!key)throw new Error("DoDomain is not configured");
  const response=await fetch(`${apiBase()}${path}`,{...init,headers:{authorization:`Bearer ${key}`,"content-type":"application/json",...(init.headers||{})},cache:"no-store"});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(body?.error?.message||body?.message||`DoDomain request failed (${response.status})`);
  return body as T;
}

export function domainSetupCapabilities(){return{automaticAvailable:configured(),automaticProvider:configured()?"dodomain":null,manualAvailable:true};}

export async function inspectDomain(hostname:string){
  if(!configured())return{configured:false,hostname,zone:null,provider:null,nameservers:[] as string[],isApex:false};
  const data=await request<DoDomainCheck>("/api/v1/domains/check",{method:"POST",body:JSON.stringify({domain:hostname})});
  const zone=String(data.zone||"").toLowerCase();
  return{configured:true,hostname:String(data.domain||hostname).toLowerCase(),zone,provider:data.provider||null,nameservers:Array.isArray(data.nameservers)?data.nameservers:[],isApex:Boolean(zone&&zone===hostname.toLowerCase())};
}

export async function createAutomaticDomainSetup(input:{hostname:string;targetHostname:string;returnUrl?:string}){
  if(!configured())return{available:false,reason:"Automatic setup is not configured"} as const;
  const inspection=await inspectDomain(input.hostname);
  if(inspection.isApex){
    return{available:false,manualRequired:true,reason:"Root domains cannot use a standard CNAME. Use manual setup or connect a subdomain such as rides."+inspection.zone,inspection} as const;
  }
  if(!inspection.zone)throw new Error("Unable to determine the DNS zone for this domain");
  const suffix=`.${inspection.zone}`;
  const host=input.hostname.toLowerCase().endsWith(suffix)?input.hostname.slice(0,-suffix.length):input.hostname;
  const session=await request<DoDomainSession>("/api/v1/sessions",{method:"POST",body:JSON.stringify({domain:input.hostname,records:[{type:"CNAME",host,value:input.targetHostname}],...(input.returnUrl?{returnUrl:input.returnUrl}:{})})});
  if(!session.connectUrl)throw new Error("DoDomain did not return a connect URL");
  return{available:true,provider:"dodomain",sessionId:session.id||null,connectUrl:session.connectUrl,inspection} as const;
}
