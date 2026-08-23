import crypto from "node:crypto";
import { getDb } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { sendEmailNotification } from "@/lib/email-send";

export const runtime="nodejs";
export const dynamic="force-dynamic";

function trackingId(){
  const date=new Date().toISOString().slice(0,10).replace(/-/g,"");
  return `BW-SEC-${date}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}
function text(value:unknown,max:number){return String(value||"").trim().slice(0,max);}
function validEmail(value:string){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);}
function validSecureEvidence(value:string){
  if(!value)return true;
  try{const u=new URL(value);return u.protocol==="https:"&&u.hostname.toLowerCase()==="secret.harrisonward.com";}catch{return false;}
}
function privateRateKey(value:string){
  const secret=process.env.AUTH_SECRET||process.env.DATA_ENCRYPTION_KEY||'bandwagon-rate-limit';
  return crypto.createHmac('sha256',secret).update(value).digest('hex').slice(0,32);
}
async function rateLimit(request:Request,email:string){
  const redis=getRedis();if(!redis)return{allowed:true};if(redis.status==='wait')await redis.connect();
  const ip=String(request.headers.get('cf-connecting-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]||'unknown').trim();
  const keys=[{key:`security-report:ip:${privateRateKey(ip)}`,limit:10},{key:`security-report:email:${privateRateKey(email)}`,limit:5}];
  for(const item of keys){const n=await redis.incr(item.key);if(n===1)await redis.expire(item.key,3600);if(n>item.limit)return{allowed:false};}
  return{allowed:true};
}

export async function POST(request:Request){
  const db=getDb();if(!db)return Response.json({error:"Reporting is temporarily unavailable"},{status:503});
  const body=await request.json().catch(()=>({}));
  const honeypot=text(body.companyWebsite,200);if(honeypot)return Response.json({ok:true});
  const reportType=text(body.reportType,20)||"security";
  const severity=text(body.severity,20)||"unknown";
  const title=text(body.title,180);
  const description=text(body.description,12000);
  const reproductionSteps=text(body.reproductionSteps,12000);
  const affectedUrl=text(body.affectedUrl,1000);
  const contactEmail=text(body.contactEmail,320).toLowerCase();
  const secureEvidenceUrl=text(body.secureEvidenceUrl,2000);
  const safeHarborAcknowledged=Boolean(body.safeHarborAcknowledged);
  if(!["security","privacy","safety","bug"].includes(reportType))return Response.json({error:"Invalid report type"},{status:400});
  if(!["unknown","low","medium","high","critical"].includes(severity))return Response.json({error:"Invalid severity"},{status:400});
  if(title.length<5||description.length<20)return Response.json({error:"Please include a clear title and enough detail for us to investigate"},{status:400});
  if(!validEmail(contactEmail))return Response.json({error:"A valid contact email is required"},{status:400});
  if(!validSecureEvidence(secureEvidenceUrl))return Response.json({error:"Sensitive evidence links must use https://secret.harrisonward.com"},{status:400});
  if(!safeHarborAcknowledged)return Response.json({error:"Please acknowledge the responsible disclosure rules"},{status:400});
  const rate=await rateLimit(request,contactEmail).catch(()=>({allowed:true}));
  if(!rate.allowed)return Response.json({error:"Too many reports were submitted recently. Please wait before trying again. For an urgent critical issue, use the contact information on the Security page."},{status:429});

  const id=trackingId();
  await db.query(`insert into security_reports
    (tracking_id,report_type,severity,title,description,reproduction_steps,affected_url,contact_email,secure_evidence_url,reporter_acknowledged_safe_harbor,metadata)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10::jsonb)`,[
    id,reportType,severity,title,description,reproductionSteps||null,affectedUrl||null,contactEmail,secureEvidenceUrl||null,
    JSON.stringify({userAgent:request.headers.get("user-agent")||null,rateLimitedByHashedIdentifiers:true})
  ]);

  const securityInbox=process.env.SECURITY_EMAIL||process.env.SUPPORT_EMAIL;
  if(securityInbox){
    await sendEmailNotification({to:securityInbox,subject:`[${id}] ${severity.toUpperCase()} ${title}`,body:[
      `New BandWagon ${reportType} report`,
      `Tracking: ${id}`,
      `Severity: ${severity}`,
      `Reporter: ${contactEmail}`,
      affectedUrl?`Affected URL: ${affectedUrl}`:"",
      secureEvidenceUrl?`Secure evidence: ${secureEvidenceUrl}`:"",
      "",
      description,
      reproductionSteps?`\nReproduction steps:\n${reproductionSteps}`:""
    ].filter(Boolean).join("\n"),notificationType:"security_report",urgency:severity==="critical"?"critical":"important"}).catch(()=>{});
  }

  await sendEmailNotification({to:contactEmail,subject:`BandWagon security report received - ${id}`,body:`Thank you for reporting this to BandWagon. Your tracking ID is ${id}. We will use ${contactEmail} if we need more information. Do not send passwords, authentication codes, private information about minors, or sensitive documents by ordinary email. Use https://secret.harrisonward.com for sensitive evidence.`,notificationType:"security_report_ack",urgency:"important"}).catch(()=>{});
  return Response.json({ok:true,trackingId:id});
}
