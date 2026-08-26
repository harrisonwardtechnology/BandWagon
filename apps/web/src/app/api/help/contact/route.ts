import crypto from "node:crypto";
import { sendEmailNotification } from "@/lib/email-send";
import { getRedis } from "@/lib/redis";
import { turnstileConfigured, verifyTurnstileToken } from "@/lib/turnstile";

export const runtime="nodejs";export const dynamic="force-dynamic";
const topics:Record<string,string>={technical:"Technical problem",account:"Account or sign-in",organization:"Organization setup",ride:"Ride or event question",privacy:"Privacy request",other:"Other"};
function clean(value:unknown,max:number){return String(value||"").replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,max);}
function validEmail(value:string){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);}
function privateKey(value:string){const secret=process.env.AUTH_SECRET||process.env.DATA_ENCRYPTION_KEY||"bandwagon-help-rate-limit";return crypto.createHmac("sha256",secret).update(value).digest("hex").slice(0,32);}
function clientIp(request:Request){return clean(request.headers.get("cf-connecting-ip")||request.headers.get("x-forwarded-for")?.split(",")[0]||"unknown",100);}
async function rateLimit(ip:string,email:string){const redis=getRedis();if(!redis)return true;if(redis.status==="wait")await redis.connect();for(const item of [{key:`help:ip:${privateKey(ip)}`,limit:8},{key:`help:email:${privateKey(email)}`,limit:4}]){const count=await redis.incr(item.key);if(count===1)await redis.expire(item.key,3600);if(count>item.limit)return false;}return true;}

export async function POST(request:Request){
  if(!turnstileConfigured())return Response.json({error:"The support form is temporarily unavailable."},{status:503});
  const body=await request.json().catch(()=>({}));if(clean(body.companyWebsite,200))return Response.json({ok:true});
  const name=clean(body.name,100),email=clean(body.email,320).toLowerCase(),topic=clean(body.topic,30),message=clean(body.message,5000),token=clean(body.turnstileToken,3000),ip=clientIp(request);
  if(name.length<2||!validEmail(email)||!topics[topic]||message.length<10)return Response.json({error:"Please complete your name, email, topic, and message."},{status:400});
  if(!await verifyTurnstileToken(request,token,"support_contact").catch(()=>false))return Response.json({error:"The security check was unsuccessful. Please try again."},{status:400});
  if(!await rateLimit(ip,email).catch(()=>false))return Response.json({error:"Too many support messages were submitted recently. Please wait before trying again."},{status:429});
  const to=process.env.SUPPORT_EMAIL;if(!to)return Response.json({error:"The support form is temporarily unavailable."},{status:503});
  const result=await sendEmailNotification({to,subject:`BandWagon Support - ${topics[topic]}`,body:["New BandWagon Help Center message",`From: ${name} <${email}>`,`Topic: ${topics[topic]}`,"",message,"",`Reply to: ${email}`].join("\n"),notificationType:"support_contact",urgency:topic==="privacy"?"important":"routine"});
  if(!result.ok)return Response.json({error:"Your message could not be delivered. Please try again later."},{status:502});
  return Response.json({ok:true});
}
