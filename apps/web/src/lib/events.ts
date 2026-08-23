import { getDb } from "@/lib/db";

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

export async function normalizeImportedCalendarEvents() {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");

  const imported = await db.query(`
    select ce.*, gc.organization_id
    from calendar_events ce
    left join google_calendars gcal
      on ce.provider='google' and gcal.external_calendar_id=ce.provider_calendar_id
    left join google_connections gc on gc.id=gcal.connection_id
    where ce.provider='google' and gc.organization_id is not null
    order by ce.starts_at nulls last
  `);

  let normalized = 0;
  let skipped = 0;
  for (const row of imported.rows) {
    if (!row.organization_id) {
      skipped++;
      continue;
    }

    const status = row.status === "cancelled" ? "cancelled" : "active";
    const upsert = await db.query(
      `insert into events
        (organization_id,title,description,location_name,starts_at,ends_at,all_day,status,
         visibility,ride_coordination_enabled,source_type,source_calendar_id,source_event_id,
         source_url,source_updated_at,updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'organization',true,'google',$9,$10,$11,$12,now())
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
