import crypto from "node:crypto";
import { getDb } from "@/lib/db";
import { decryptSensitive, encryptSensitive } from "@/lib/data-security";
import { isAllowedMicrosoftGraphNextLink, microsoftDateTime } from "@/lib/microsoft-calendar-policy";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const MICROSOFT_SCOPES = ["openid","profile","email","offline_access","User.Read","Calendars.Read"];

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function tenant() {
  return String(process.env.MICROSOFT_TENANT_ID || "organizations").trim() || "organizations";
}

function stateKey() {
  return crypto.createHash("sha256").update(required("AUTH_SECRET")).digest();
}

export function createMicrosoftState(organizationId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("Valid organizationId is required");
  const payload = { provider:"microsoft", organizationId, nonce:crypto.randomBytes(16).toString("hex"), issuedAt:Date.now() };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256",stateKey()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyMicrosoftState(state: string) {
  const [encoded,supplied] = state.split(".");
  if (!encoded || !supplied) return null;
  const expected = crypto.createHmac("sha256",stateKey()).update(encoded).digest("base64url");
  const a=Buffer.from(supplied),b=Buffer.from(expected);
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;
  try {
    const payload=JSON.parse(Buffer.from(encoded,"base64url").toString("utf8"));
    if(payload.provider!=="microsoft"||typeof payload.issuedAt!=="number"||Date.now()-payload.issuedAt>=10*60_000)return null;
    return /^[0-9a-f-]{36}$/i.test(payload.organizationId)?String(payload.organizationId):null;
  } catch { return null; }
}

export function microsoftAuthorizationUrl(organizationId: string) {
  const url=new URL(`https://login.microsoftonline.com/${encodeURIComponent(tenant())}/oauth2/v2.0/authorize`);
  url.searchParams.set("client_id",required("MICROSOFT_CLIENT_ID"));
  url.searchParams.set("redirect_uri",required("MICROSOFT_REDIRECT_URI"));
  url.searchParams.set("response_type","code");
  url.searchParams.set("response_mode","query");
  url.searchParams.set("scope",MICROSOFT_SCOPES.join(" "));
  url.searchParams.set("state",createMicrosoftState(organizationId));
  url.searchParams.set("prompt","select_account");
  return url.toString();
}

type MicrosoftTokens = { access_token:string;refresh_token?:string;expires_in?:number;scope?:string;id_token?:string };

async function tokenRequest(params: URLSearchParams): Promise<MicrosoftTokens> {
  const response=await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant())}/oauth2/v2.0/token`,{
    method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:params,cache:"no-store",
  });
  const body=await response.json();
  if(!response.ok)throw new Error(body.error_description||body.error||"Microsoft token request failed");
  return body;
}

export async function exchangeMicrosoftCode(code: string) {
  return tokenRequest(new URLSearchParams({
    client_id:required("MICROSOFT_CLIENT_ID"),client_secret:required("MICROSOFT_CLIENT_SECRET"),
    redirect_uri:required("MICROSOFT_REDIRECT_URI"),grant_type:"authorization_code",code,
    scope:MICROSOFT_SCOPES.join(" "),
  }));
}

async function refreshMicrosoftAccessToken(refreshToken: string) {
  return tokenRequest(new URLSearchParams({
    client_id:required("MICROSOFT_CLIENT_ID"),client_secret:required("MICROSOFT_CLIENT_SECRET"),
    grant_type:"refresh_token",refresh_token:refreshToken,scope:MICROSOFT_SCOPES.join(" "),
  }));
}

async function graphFetchWithToken(url: string, accessToken: string) {
  const response=await fetch(url,{headers:{authorization:`Bearer ${accessToken}`,accept:"application/json",Prefer:'outlook.timezone="UTC"'},cache:"no-store"});
  const body=await response.json();
  if(!response.ok)throw new Error(body.error?.message||"Microsoft Graph request failed");
  return body;
}

export async function saveMicrosoftConnection(organizationId: string,tokens: MicrosoftTokens) {
  if(!tokens.refresh_token)throw new Error("Microsoft did not return a refresh token. Reconnect and grant offline access.");
  const profile=await graphFetchWithToken(`${GRAPH_BASE}/me?$select=id,displayName,mail,userPrincipalName`,tokens.access_token);
  const db=getDb();if(!db)throw new Error("Database is not configured");
  const expiresAt=tokens.expires_in?new Date(Date.now()+tokens.expires_in*1000):null;
  await db.query(`insert into microsoft_connections
    (organization_id,microsoft_subject,tenant_id,email,display_name,refresh_token_encrypted,access_token_encrypted,access_token_expires_at,granted_scopes,status,last_error,updated_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',null,now())
    on conflict(organization_id) do update set microsoft_subject=excluded.microsoft_subject,tenant_id=excluded.tenant_id,
      email=excluded.email,display_name=excluded.display_name,refresh_token_encrypted=excluded.refresh_token_encrypted,
      access_token_encrypted=excluded.access_token_encrypted,access_token_expires_at=excluded.access_token_expires_at,
      granted_scopes=excluded.granted_scopes,status='active',last_error=null,updated_at=now()`,[
    organizationId,String(profile.id),tenant(),profile.mail||profile.userPrincipalName||null,profile.displayName||null,
    encryptSensitive(tokens.refresh_token),encryptSensitive(tokens.access_token),expiresAt,tokens.scope||MICROSOFT_SCOPES.join(" "),
  ]);
}

export async function getActiveMicrosoftConnection(organizationId: string) {
  const db=getDb();if(!db)throw new Error("Database is not configured");
  const result=await db.query(`select * from microsoft_connections where organization_id=$1 and status='active' limit 1`,[organizationId]);
  return result.rows[0]||null;
}

export async function getMicrosoftAccessToken(organizationId: string) {
  const db=getDb();if(!db)throw new Error("Database is not configured");
  const connection=await getActiveMicrosoftConnection(organizationId);
  if(!connection)throw new Error("No active Microsoft Calendar connection for this organization");
  if(connection.access_token_encrypted&&connection.access_token_expires_at&&new Date(connection.access_token_expires_at).getTime()>Date.now()+60_000)return decryptSensitive(connection.access_token_encrypted);
  try {
    const refreshed=await refreshMicrosoftAccessToken(decryptSensitive(connection.refresh_token_encrypted));
    const expiresAt=refreshed.expires_in?new Date(Date.now()+refreshed.expires_in*1000):null;
    await db.query(`update microsoft_connections set access_token_encrypted=$1,refresh_token_encrypted=coalesce($2,refresh_token_encrypted),access_token_expires_at=$3,last_error=null,updated_at=now() where id=$4`,[
      encryptSensitive(refreshed.access_token),refreshed.refresh_token?encryptSensitive(refreshed.refresh_token):null,expiresAt,connection.id,
    ]);
    return refreshed.access_token;
  } catch(error) {
    await db.query(`update microsoft_connections set status='error',last_error=$1,updated_at=now() where id=$2`,[error instanceof Error?error.message.slice(0,1000):"Token refresh failed",connection.id]).catch(()=>undefined);
    throw error;
  }
}

async function microsoftGraphFetch(organizationId: string,pathOrUrl: string) {
  const url=pathOrUrl.startsWith("https://")?pathOrUrl:`${GRAPH_BASE}${pathOrUrl}`;
  if(!url.startsWith(`${GRAPH_BASE}/`))throw new Error("Microsoft Graph pagination URL was rejected");
  return graphFetchWithToken(url,await getMicrosoftAccessToken(organizationId));
}

export async function listMicrosoftCalendars(organizationId: string) {
  const calendars:any[]=[];let next=`${GRAPH_BASE}/me/calendars?$select=id,name,color,canEdit,owner&$top=250`;
  do {
    const body=await microsoftGraphFetch(organizationId,next);calendars.push(...(body.value||[]));
    next=isAllowedMicrosoftGraphNextLink(body["@odata.nextLink"])?body["@odata.nextLink"]:"";
  } while(next);
  return calendars.map(cal=>({id:cal.id,summary:cal.name||"(Unnamed calendar)",color:cal.color||null,canEdit:Boolean(cal.canEdit),ownerName:cal.owner?.name||null,ownerAddress:cal.owner?.address||null}));
}

export async function setSelectedMicrosoftCalendars(organizationId: string,calendarIds: string[]) {
  const db=getDb();if(!db)throw new Error("Database is not configured");
  const connection=await getActiveMicrosoftConnection(organizationId);if(!connection)throw new Error("No active Microsoft Calendar connection");
  const calendars=await listMicrosoftCalendars(organizationId),allowed=new Set(calendars.map(cal=>cal.id));
  for(const id of calendarIds)if(!allowed.has(id))throw new Error(`Unknown Microsoft calendar: ${id}`);
  for(const calendar of calendars)await db.query(`insert into microsoft_calendars
    (connection_id,external_calendar_id,summary,color,owner_name,owner_address,can_edit,selected,last_seen_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,now())
    on conflict(connection_id,external_calendar_id) do update set summary=excluded.summary,color=excluded.color,
      owner_name=excluded.owner_name,owner_address=excluded.owner_address,can_edit=excluded.can_edit,
      selected=excluded.selected,last_seen_at=now(),updated_at=now()`,[
    connection.id,calendar.id,calendar.summary,calendar.color,calendar.ownerName,calendar.ownerAddress,calendar.canEdit,calendarIds.includes(calendar.id),
  ]);
}

export async function syncSelectedMicrosoftCalendars(organizationId: string) {
  const db=getDb();if(!db)throw new Error("Database is not configured");
  const connection=await getActiveMicrosoftConnection(organizationId);if(!connection)throw new Error("No active Microsoft Calendar connection");
  const selected=await db.query(`select * from microsoft_calendars where connection_id=$1 and selected=true order by summary`,[connection.id]);
  const start=new Date(Date.now()-Number(process.env.CALENDAR_LOOKBACK_DAYS||30)*86400000).toISOString();
  const end=new Date(Date.now()+Number(process.env.CALENDAR_LOOKAHEAD_DAYS||180)*86400000).toISOString();
  let totalEvents=0;
  for(const calendar of selected.rows){
    try {
      const query=new URLSearchParams({startDateTime:start,endDateTime:end,"$top":"1000","$select":"id,subject,bodyPreview,location,start,end,isAllDay,isCancelled,webLink,lastModifiedDateTime"});
      let next=`${GRAPH_BASE}/me/calendars/${encodeURIComponent(calendar.external_calendar_id)}/calendarView?${query}`;
      do {
        const body=await microsoftGraphFetch(organizationId,next);
        for(const event of body.value||[]){
          await db.query(`insert into calendar_events
            (organization_id,provider,provider_calendar_id,provider_event_id,title,description,location,starts_at,ends_at,all_day,status,html_link,raw_etag,updated_at)
            values($1,'microsoft',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
            on conflict(provider,provider_calendar_id,provider_event_id) do update set organization_id=excluded.organization_id,
              title=excluded.title,description=excluded.description,location=excluded.location,starts_at=excluded.starts_at,
              ends_at=excluded.ends_at,all_day=excluded.all_day,status=excluded.status,html_link=excluded.html_link,
              raw_etag=excluded.raw_etag,updated_at=now()`,[
            organizationId,calendar.external_calendar_id,event.id,event.subject||"(Untitled event)",event.bodyPreview||null,
            event.location?.displayName||null,microsoftDateTime(event.start),microsoftDateTime(event.end),Boolean(event.isAllDay),
            event.isCancelled?"cancelled":"confirmed",event.webLink||null,event.lastModifiedDateTime||null,
          ]);totalEvents++;
        }
        next=isAllowedMicrosoftGraphNextLink(body["@odata.nextLink"])?body["@odata.nextLink"]:"";
      }while(next);
      await db.query(`update microsoft_calendars set last_sync_at=now(),sync_error=null,updated_at=now() where id=$1`,[calendar.id]);
    }catch(error){
      await db.query(`update microsoft_calendars set sync_error=$1,updated_at=now() where id=$2`,[error instanceof Error?error.message.slice(0,1000):"Sync failed",calendar.id]);throw error;
    }
  }
  return {organizations:1,calendars:selected.rowCount||0,events:totalEvents};
}

export async function syncAllMicrosoftCalendars() {
  const db=getDb();if(!db)throw new Error("Database is not configured");
  const organizations=await db.query(`select organization_id from microsoft_connections where status='active' order by updated_at`);
  let calendars=0,events=0,succeeded=0;const failures:Array<{organizationId:string;error:string}>=[];
  for(const row of organizations.rows){
    try{const result=await syncSelectedMicrosoftCalendars(row.organization_id);calendars+=result.calendars;events+=result.events;succeeded++;}
    catch(error){failures.push({organizationId:row.organization_id,error:error instanceof Error?error.message.slice(0,300):"Sync failed"});}
  }
  if(failures.length)throw new Error(`Microsoft Calendar sync failed for ${failures.length} organization(s): ${failures.map(f=>f.organizationId).join(", ")}`);
  return {organizations:succeeded,calendars,events};
}

export async function microsoftIntegrationStatus(organizationId: string) {
  const db=getDb();if(!db)return{configured:false,database:false};
  const connection=await getActiveMicrosoftConnection(organizationId);
  const calendars=connection?await db.query(`select external_calendar_id,summary,selected,last_sync_at,sync_error from microsoft_calendars where connection_id=$1 order by summary`,[connection.id]):{rows:[]};
  return {configured:Boolean(process.env.MICROSOFT_CLIENT_ID&&process.env.MICROSOFT_CLIENT_SECRET&&process.env.MICROSOFT_REDIRECT_URI),connected:Boolean(connection),account:connection?{email:connection.email,displayName:connection.display_name,updatedAt:connection.updated_at}:null,calendars:calendars.rows};
}
