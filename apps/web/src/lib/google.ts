import crypto from "node:crypto";
import { getDb } from "@/lib/db";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function encryptionKey() {
  return crypto.createHash("sha256").update(required("DATA_ENCRYPTION_KEY")).digest();
}

export function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((b) => b.toString("base64url")).join(".");
}

export function decryptSecret(value: string) {
  const [ivPart, tagPart, encryptedPart] = value.split(".");
  if (!ivPart || !tagPart || !encryptedPart) throw new Error("Invalid encrypted secret");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedPart, "base64url")), decipher.final()]).toString("utf8");
}

function stateKey() {
  return crypto.createHash("sha256").update(required("AUTH_SECRET")).digest();
}

export function createGoogleState() {
  const payload = { nonce: crypto.randomBytes(16).toString("hex"), issuedAt: Date.now() };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", stateKey()).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyGoogleState(state: string) {
  const [encoded, supplied] = state.split(".");
  if (!encoded || !supplied) return false;
  const expected = crypto.createHmac("sha256", stateKey()).update(encoded).digest("base64url");
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return typeof payload.issuedAt === "number" && Date.now() - payload.issuedAt < 10 * 60_000;
  } catch { return false; }
}

export function googleAuthorizationUrl() {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", required("GOOGLE_CLIENT_ID"));
  url.searchParams.set("redirect_uri", required("GOOGLE_REDIRECT_URI"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("scope", ["openid","email","profile","https://www.googleapis.com/auth/calendar.readonly"].join(" "));
  url.searchParams.set("state", createGoogleState());
  return url.toString();
}

async function tokenRequest(params: URLSearchParams) {
  const response = await fetch(GOOGLE_TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: params, cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error_description || body.error || "Google token request failed");
  return body as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
}

export async function exchangeGoogleCode(code: string) {
  return tokenRequest(new URLSearchParams({ client_id: required("GOOGLE_CLIENT_ID"), client_secret: required("GOOGLE_CLIENT_SECRET"), redirect_uri: required("GOOGLE_REDIRECT_URI"), grant_type: "authorization_code", code }));
}

async function refreshAccessToken(refreshToken: string) {
  return tokenRequest(new URLSearchParams({ client_id: required("GOOGLE_CLIENT_ID"), client_secret: required("GOOGLE_CLIENT_SECRET"), grant_type: "refresh_token", refresh_token: refreshToken }));
}

export async function saveGoogleConnection(tokens: Awaited<ReturnType<typeof exchangeGoogleCode>>) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  if (!tokens.refresh_token) throw new Error("Google did not return a refresh token. Revoke prior consent and connect again.");
  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${tokens.access_token}` }, cache: "no-store" });
  const profile = await profileResponse.json() as { sub: string; email?: string; name?: string };
  if (!profileResponse.ok) throw new Error("Unable to read Google account profile");
  const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;
  await db.query(`insert into google_connections (google_subject,email,display_name,refresh_token_encrypted,access_token_encrypted,access_token_expires_at,granted_scopes,status,updated_at)
    values ($1,$2,$3,$4,$5,$6,$7,'active',now()) on conflict (google_subject) do update set email=excluded.email,display_name=excluded.display_name,
    refresh_token_encrypted=excluded.refresh_token_encrypted,access_token_encrypted=excluded.access_token_encrypted,access_token_expires_at=excluded.access_token_expires_at,
    granted_scopes=excluded.granted_scopes,status='active',updated_at=now()`, [profile.sub, profile.email || null, profile.name || null, encryptSecret(tokens.refresh_token), encryptSecret(tokens.access_token), expiresAt, tokens.scope || null]);
}

export async function getActiveGoogleConnection() {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const result = await db.query(`select * from google_connections where status='active' order by updated_at desc limit 1`);
  return result.rows[0] || null;
}

export async function getGoogleAccessToken() {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const conn = await getActiveGoogleConnection();
  if (!conn) throw new Error("No active Google Calendar connection");
  if (conn.access_token_encrypted && conn.access_token_expires_at && new Date(conn.access_token_expires_at).getTime() > Date.now() + 60_000) return decryptSecret(conn.access_token_encrypted);
  const refreshed = await refreshAccessToken(decryptSecret(conn.refresh_token_encrypted));
  const expiresAt = refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000) : null;
  await db.query(`update google_connections set access_token_encrypted=$1, access_token_expires_at=$2, updated_at=now() where id=$3`, [encryptSecret(refreshed.access_token), expiresAt, conn.id]);
  return refreshed.access_token;
}

async function googleCalendarFetch(path: string) {
  const response = await fetch(`${GOOGLE_CALENDAR_BASE}${path}`, { headers: { authorization: `Bearer ${await getGoogleAccessToken()}` }, cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || "Google Calendar request failed");
  return body;
}

export async function listGoogleCalendars() {
  const body = await googleCalendarFetch("/users/me/calendarList?maxResults=250&showHidden=false");
  return (body.items || []).map((item: any) => ({ id: item.id, summary: item.summary, description: item.description || null, primary: Boolean(item.primary), accessRole: item.accessRole, timeZone: item.timeZone || null }));
}

export async function setSelectedCalendars(calendarIds: string[]) {
  const db = getDb(); if (!db) throw new Error("Database is not configured");
  const conn = await getActiveGoogleConnection(); if (!conn) throw new Error("No active Google connection");
  const calendars = await listGoogleCalendars();
  const allowed = new Set(calendars.map((c: any) => c.id));
  for (const id of calendarIds) if (!allowed.has(id)) throw new Error(`Unknown Google calendar: ${id}`);
  for (const cal of calendars) {
    await db.query(`insert into google_calendars (connection_id,external_calendar_id,summary,description,time_zone,selected,last_seen_at)
      values ($1,$2,$3,$4,$5,$6,now()) on conflict (connection_id,external_calendar_id) do update set summary=excluded.summary,description=excluded.description,
      time_zone=excluded.time_zone,selected=excluded.selected,last_seen_at=now(),updated_at=now()`, [conn.id, cal.id, cal.summary, cal.description, cal.timeZone, calendarIds.includes(cal.id)]);
  }
}

function eventTime(event: any, field: "start" | "end") {
  const value = event[field]; if (!value) return null;
  if (value.dateTime) return new Date(value.dateTime);
  if (value.date) return new Date(`${value.date}T00:00:00Z`);
  return null;
}

export async function syncSelectedGoogleCalendars() {
  const db = getDb(); if (!db) throw new Error("Database is not configured");
  const conn = await getActiveGoogleConnection(); if (!conn) throw new Error("No active Google connection");
  const selected = await db.query(`select * from google_calendars where connection_id=$1 and selected=true order by summary`, [conn.id]);
  const timeMin = new Date(Date.now() - Number(process.env.CALENDAR_LOOKBACK_DAYS || 30) * 86400000).toISOString();
  const timeMax = new Date(Date.now() + Number(process.env.CALENDAR_LOOKAHEAD_DAYS || 180) * 86400000).toISOString();
  let totalEvents = 0;
  for (const cal of selected.rows) {
    try {
      let pageToken = "";
      do {
        const qs = new URLSearchParams({ singleEvents: "true", showDeleted: "true", maxResults: "2500", orderBy: "startTime", timeMin, timeMax });
        if (pageToken) qs.set("pageToken", pageToken);
        const body = await googleCalendarFetch(`/calendars/${encodeURIComponent(cal.external_calendar_id)}/events?${qs}`);
        for (const event of body.items || []) {
          await db.query(`insert into calendar_events (provider,provider_calendar_id,provider_event_id,title,description,location,starts_at,ends_at,all_day,status,html_link,raw_etag,updated_at)
            values ('google',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now()) on conflict (provider,provider_calendar_id,provider_event_id) do update set title=excluded.title,
            description=excluded.description,location=excluded.location,starts_at=excluded.starts_at,ends_at=excluded.ends_at,all_day=excluded.all_day,status=excluded.status,
            html_link=excluded.html_link,raw_etag=excluded.raw_etag,updated_at=now()`, [cal.external_calendar_id,event.id,event.summary || "(Untitled event)",event.description || null,event.location || null,eventTime(event,"start"),eventTime(event,"end"),Boolean(event.start?.date && !event.start?.dateTime),event.status || "confirmed",event.htmlLink || null,event.etag || null]);
          totalEvents++;
        }
        pageToken = body.nextPageToken || "";
      } while (pageToken);
      await db.query(`update google_calendars set last_sync_at=now(),sync_error=null,updated_at=now() where id=$1`, [cal.id]);
    } catch (error) {
      await db.query(`update google_calendars set sync_error=$1,updated_at=now() where id=$2`, [error instanceof Error ? error.message : "sync failed", cal.id]);
      throw error;
    }
  }
  return { calendars: selected.rowCount || 0, events: totalEvents };
}

export async function googleIntegrationStatus() {
  const db = getDb(); if (!db) return { configured: false, database: false };
  const conn = await getActiveGoogleConnection();
  const calendars = conn ? await db.query(`select external_calendar_id,summary,selected,last_sync_at,sync_error from google_calendars where connection_id=$1 order by summary`, [conn.id]) : { rows: [] };
  return { configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI), browserMapsConfigured: Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY), serverMapsConfigured: Boolean(process.env.GOOGLE_MAPS_SERVER_API_KEY), connected: Boolean(conn), account: conn ? { email: conn.email, displayName: conn.display_name, updatedAt: conn.updated_at } : null, calendars: calendars.rows };
}
