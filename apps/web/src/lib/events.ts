import { getDb } from "@/lib/db";
import { calendarConflictMode, classifyCalendarConflict } from "@/lib/calendar-conflict-policy";

export async function getOrganizationCalendarControls(organizationId:string){
  const db=getDb();if(!db)throw new Error("Database is not configured");
  await db.query(`insert into organization_calendar_settings(organization_id) values($1) on conflict do nothing`,[organizationId]);
  const [settings,conflicts]=await Promise.all([
    db.query(`select * from organization_calendar_settings where organization_id=$1`,[organizationId]),
    db.query(`select c.*,ce.provider,ce.title as imported_title,e.title as existing_title
      from calendar_event_conflicts c join calendar_events ce on ce.id=c.calendar_event_id join events e on e.id=c.existing_event_id
      where c.organization_id=$1 order by c.detected_at desc limit 50`,[organizationId]),
  ]);
  return{settings:settings.rows[0],conflicts:conflicts.rows};
}

export async function updateOrganizationCalendarControls(input:{organizationId:string;googleSyncEnabled:boolean;microsoftSyncEnabled:boolean;conflictMode:unknown;actorPersonId:string}){
  const db=getDb();if(!db)throw new Error("Database is not configured");const mode=calendarConflictMode(input.conflictMode);
  const result=await db.query(`insert into organization_calendar_settings(organization_id,google_sync_enabled,microsoft_sync_enabled,conflict_mode,updated_by_person_id)
    values($1,$2,$3,$4,$5) on conflict(organization_id) do update set google_sync_enabled=excluded.google_sync_enabled,
    microsoft_sync_enabled=excluded.microsoft_sync_enabled,conflict_mode=excluded.conflict_mode,updated_by_person_id=excluded.updated_by_person_id,updated_at=now() returning *`,
    [input.organizationId,input.googleSyncEnabled,input.microsoftSyncEnabled,mode,input.actorPersonId]);
  await db.query(`insert into audit_events(organization_id,actor_person_id,action,target_type,target_id,metadata) values($1,$2,'organization.calendar_controls_updated','organization',$1,$3::jsonb)`,[input.organizationId,input.actorPersonId,JSON.stringify({googleSyncEnabled:input.googleSyncEnabled,microsoftSyncEnabled:input.microsoftSyncEnabled,conflictMode:mode})]);
  return result.rows[0];
}

export async function assignActiveGoogleConnectionToOrganization(organizationId: string) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const result = await db.query(
    `update google_connections
     set organization_id=$1, updated_at=now()
     where id=(select id from google_connections where status='active' order by updated_at desc limit 1)
     returning id,email,display_name,organization_id`,
    [organizationId]
  );
  if (!result.rows[0]) throw new Error("No active Google connection");
  return result.rows[0];
}

export async function normalizeImportedCalendarEvents(onlyOrganizationId?:string|null) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");

  const imported = await db.query(`
    select ce.*, coalesce(gc.organization_id,mc.organization_id) as organization_id
    from calendar_events ce
    left join google_calendars gcal
      on ce.provider='google' and gcal.external_calendar_id=ce.provider_calendar_id
    left join google_connections gc on gc.id=gcal.connection_id
    left join microsoft_calendars mcal
      on ce.provider='microsoft' and mcal.external_calendar_id=ce.provider_calendar_id
    left join microsoft_connections mc on mc.id=mcal.connection_id
    left join organization_calendar_settings ocs on ocs.organization_id=coalesce(gc.organization_id,mc.organization_id)
    where ce.provider in ('google','microsoft') and coalesce(gc.organization_id,mc.organization_id) is not null
      and ($1::uuid is null or coalesce(gc.organization_id,mc.organization_id)=$1)
      and case when ce.provider='google' then coalesce(ocs.google_sync_enabled,true) else coalesce(ocs.microsoft_sync_enabled,true) end
    order by ce.starts_at nulls last
  `,[onlyOrganizationId||null]);

  let normalized = 0;
  let skipped = 0;
  for (const row of imported.rows) {
    if (!row.organization_id) {
      skipped++;
      continue;
    }

    const status = row.status === "cancelled" ? "cancelled" : "active";
    const settings=await db.query(`select conflict_mode from organization_calendar_settings where organization_id=$1`,[row.organization_id]);
    const mode=calendarConflictMode(settings.rows[0]?.conflict_mode);
    const nearby=await db.query(`select id,title,starts_at,ends_at from events where organization_id=$1 and source_type<>$2 and status<>'archived' and starts_at between $3::timestamptz-interval '1 day' and $3::timestamptz+interval '1 day' order by starts_at limit 100`,[row.organization_id,row.provider,row.starts_at]);
    const conflict=nearby.rows.map((existing:any)=>({existing,type:classifyCalendarConflict({title:row.title,startsAt:row.starts_at,endsAt:row.ends_at},{title:existing.title,startsAt:existing.starts_at,endsAt:existing.ends_at})})).find((item:any)=>item.type);
    if(conflict?.type==='exact_duplicate'&&mode==='merge_exact'){
      await db.query(`update calendar_events set organization_id=$1,normalized_event_id=$2,normalized_at=now(),updated_at=now() where id=$3`,[row.organization_id,conflict.existing.id,row.id]);
      await db.query(`insert into calendar_event_conflicts(organization_id,calendar_event_id,existing_event_id,conflict_type,resolution,resolved_at,metadata) values($1,$2,$3,'exact_duplicate','merged',now(),$4::jsonb) on conflict(organization_id,calendar_event_id,existing_event_id) do update set resolution='merged',resolved_at=now(),metadata=excluded.metadata`,[row.organization_id,row.id,conflict.existing.id,JSON.stringify({provider:row.provider,conflictMode:mode})]);
      normalized++;continue;
    }
    const upsert = await db.query(
      `insert into events
        (organization_id,title,description,location_name,starts_at,ends_at,all_day,status,
         visibility,ride_coordination_enabled,source_type,source_calendar_id,source_event_id,
         source_url,source_updated_at,updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'organization',true,$9,$10,$11,$12,$13,now())
       on conflict (organization_id,source_type,source_calendar_id,source_event_id)
       do update set
         title=excluded.title,
         description=excluded.description,
         location_name=excluded.location_name,
         starts_at=excluded.starts_at,
         ends_at=excluded.ends_at,
         all_day=excluded.all_day,
         status=excluded.status,
         source_url=excluded.source_url,
         source_updated_at=excluded.source_updated_at,
         updated_at=now()
       returning id`,
      [
        row.organization_id,
        row.title,
        row.description || null,
        row.location || null,
        row.starts_at,
        row.ends_at,
        Boolean(row.all_day),
        status,
        row.provider,
        row.provider_calendar_id,
        row.provider_event_id,
        row.html_link || null,
        row.updated_at || null,
      ]
    );

    await db.query(
      `update calendar_events
       set organization_id=$1, normalized_event_id=$2, normalized_at=now(), updated_at=now()
       where id=$3`,
      [row.organization_id, upsert.rows[0].id, row.id]
    );
    if(conflict){const resolution=conflict.type==='exact_duplicate'?'kept_separate':'pending_review';await db.query(`insert into calendar_event_conflicts(organization_id,calendar_event_id,existing_event_id,conflict_type,resolution,resolved_at,metadata) values($1,$2,$3,$4,$5,case when $5='pending_review' then null else now() end,$6::jsonb) on conflict(organization_id,calendar_event_id,existing_event_id) do update set conflict_type=excluded.conflict_type,resolution=excluded.resolution,resolved_at=excluded.resolved_at,metadata=excluded.metadata`,[row.organization_id,row.id,conflict.existing.id,conflict.type,resolution,JSON.stringify({provider:row.provider,conflictMode:mode})]);}
    normalized++;
  }

  return { imported: imported.rowCount || 0, normalized, skipped };
}

export async function createManualEvent(input: {
  organizationId: string;
  title: string;
  description?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  allDay?: boolean;
  visibility?: "organization" | "group" | "private";
  rideCoordinationEnabled?: boolean;
  createdByPersonId?: string | null;
}) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const title = input.title.trim();
  if (!title) throw new Error("Event title is required");

  const result = await db.query(
    `insert into events
      (organization_id,title,description,location_name,location_address,starts_at,ends_at,
       all_day,status,visibility,ride_coordination_enabled,source_type,created_by_person_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9,$10,'manual',$11)
     returning *`,
    [
      input.organizationId,
      title,
      input.description || null,
      input.locationName || null,
      input.locationAddress || null,
      input.startsAt ? new Date(input.startsAt) : null,
      input.endsAt ? new Date(input.endsAt) : null,
      Boolean(input.allDay),
      input.visibility || "organization",
      input.rideCoordinationEnabled !== false,
      input.createdByPersonId || null,
    ]
  );
  return result.rows[0];
}

export async function listOrganizationEvents(organizationId: string, limit = 100) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const result = await db.query(
    `select id,title,description,location_name,location_address,starts_at,ends_at,all_day,status,
            visibility,ride_coordination_enabled,source_type,source_calendar_id,source_event_id,source_url
     from events
     where organization_id=$1 and status <> 'archived'
     order by starts_at nulls last, created_at desc
     limit $2`,
    [organizationId, Math.max(1, Math.min(limit, 500))]
  );
  return result.rows;
}

export async function listOrganizationsForEventAdmin() {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const result = await db.query(
    `select id,slug,coalesce(display_name,name) as name,tenant_hostname
     from organizations where status='active' order by name`
  );
  return result.rows;
}
