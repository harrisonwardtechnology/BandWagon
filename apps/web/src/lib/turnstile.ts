function clientIp(request:Request){return String(request.headers.get("cf-connecting-ip")||request.headers.get("x-real-ip")||request.headers.get("x-forwarded-for")?.split(",")[0]||"").trim();}

export function turnstileConfigured(){return Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY&&process.env.TURNSTILE_SECRET_KEY);}

export async function verifyTurnstileToken(request:Request,token:unknown,expectedAction:string){
  const secret=process.env.TURNSTILE_SECRET_KEY,responseToken=String(token||"").trim();if(!secret||!responseToken)return false;
  const form=new URLSearchParams({secret,response:responseToken});const ip=clientIp(request);if(ip)form.set("remoteip",ip);
  const response=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:form,cache:"no-store",signal:AbortSignal.timeout(8000)});
  const result=await response.json().catch(()=>({}));return response.ok&&result.success===true&&result.action===expectedAction;
}
