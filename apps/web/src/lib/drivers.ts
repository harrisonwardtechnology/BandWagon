import { getDb } from "@/lib/db";

function dbRequired() {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

async function assertMembership(organizationId: string, personId: string) {
  const db = dbRequired();
  const result = await db.query(
    `select 1 from memberships where organization_id=$1 and person_id=$2 and status='active' limit 1`,
    [organizationId, personId]
  );
  if (!result.rowCount) throw new Error("Driver is not an active member of this organization");
}

export async function upsertDriverProfile(input: {
  organizationId: string;
  personId: string;
  defaultCapacity?: number;
  status?: 'active' | 'paused' | 'blocked';
  willingByDefault?: boolean;
  allowMultiPassenger?: boolean;
  maxDetourMinutes?: number;
  maxPickupRadiusKm?: number;
  vehicleLabel?: string | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleColor?: string | null;
  licensePlateHint?: string | null;
  notes?: string | null;
}) {
  const db = dbRequired();
  await assertMembership(input.organizationId, input.personId);
  const capacity = Math.max(1, Math.min(12, Number(input.defaultCapacity || 1)));
  const detour = Math.max(0, Math.min(90, Number(input.maxDetourMinutes ?? 15)));
  const radius = Math.max(0.25, Math.min(250, Number(input.maxPickupRadiusKm ?? 8)));
  const result = await db.query(
    `insert into driver_profiles
      (person_id,default_capacity,status,willing_by_default,allow_multi_passenger,max_detour_minutes,max_pickup_radius_km,
       vehicle_label,vehicle_make,vehicle_model,vehicle_color,license_plate_hint,notes,updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())
     on conflict (person_id) do update set
       default_capacity=excluded.default_capacity,status=excluded.status,willing_by_default=excluded.willing_by_default,
       allow_multi_passenger=excluded.allow_multi_passenger,max_detour_minutes=excluded.max_detour_minutes,
       max_pickup_radius_km=excluded.max_pickup_radius_km,vehicle_label=excluded.vehicle_label,vehicle_make=excluded.vehicle_make,
       vehicle_model=excluded.vehicle_model,vehicle_color=excluded.vehicle_color,license_plate_hint=excluded.license_plate_hint,
       notes=excluded.notes,updated_at=now()
     returning *`,
    [
      input.personId,
      capacity,
      input.status || 'active',
      Boolean(input.willingByDefault),
      input.allowMultiPassenger !== false,
      detour,
      radius,
      input.vehicleLabel || null,
      input.vehicleMake || null,
      input.vehicleModel || null,
      input.vehicleColor || null,
      input.licensePlateHint || null,
      input.notes || null,
    ]
  );
  return result.rows[0];
}

export async function addDriverZone(input: {
  organizationId: string;
  driverPersonId: string;
  label: string;
  latitude: number;
  longitude: number;
  radiusKm?: number;
}) {
  const db = dbRequired();
  await assertMembership(input.organizationId, input.driverPersonId);
  const profile = await db.query(`select 1 from driver_profiles where person_id=$1 and status<>'blocked'`, [input.driverPersonId]);
  if (!profile.rowCount) throw new Error("Create an active driver profile first");
  const radius = Math.max(0.25, Math.min(250, Number(input.radiusKm ?? 8)));
  const result = await db.query(
    `insert into driver_service_zones
      (organization_id,driver_person_id,label,generalized_latitude,generalized_longitude,radius_km)
     values ($1,$2,$3,$4,$5,$6) returning *`,
    [input.organizationId,input.driverPersonId,input.label.trim(),input.latitude,input.longitude,radius]
  );
  return result.rows[0];
}

export async function addRecurringAvailability(input: {
  organizationId: string;
  driverPersonId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  timeZone?: string;
  direction?: 'any' | 'to_event' | 'from_event' | 'other';
}) {
  const db = dbRequired();
  await assertMembership(input.organizationId, input.driverPersonId);
  const weekday = Math.max(0, Math.min(6, Number(input.weekday)));
  const result = await db.query(
    `insert into driver_recurring_availability
      (organization_id,driver_person_id,weekday,start_time,end_time,time_zone,direction)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [input.organizationId,input.driverPersonId,weekday,input.startTime,input.endTime,input.timeZone || 'America/Chicago',input.direction || 'any']
  );
  return result.rows[0];
}

export async function setAvailabilityException(input: {
  organizationId: string;
  driverPersonId: string;
  date: string;
  available: boolean;
  startTime?: string | null;
  endTime?: string | null;
  note?: string | null;
}) {
  const db = dbRequired();
  await assertMembership(input.organizationId, input.driverPersonId);
  const result = await db.query(
    `insert into driver_availability_exceptions
      (organization_id,driver_person_id,exception_date,available,start_time,end_time,note,updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,now())
     on conflict (organization_id,driver_person_id,exception_date) do update set
       available=excluded.available,start_time=excluded.start_time,end_time=excluded.end_time,note=excluded.note,updated_at=now()
     returning *`,
    [input.organizationId,input.driverPersonId,input.date,input.available,input.startTime || null,input.endTime || null,input.note || null]
  );
  return result.rows[0];
}

function localParts(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday:'short',
    year:'numeric',
    month:'2-digit',
    day:'2-digit',
    hour:'2-digit',
    minute:'2-digit',
    hourCycle:'h23',
  }).formatToParts(at);
  const value = (type: string) => parts.find((p) => p.type === type)?.value || '';
  const weekdayMap: Record<string,number> = { Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6 };
  return {
    weekday: weekdayMap[value('weekday')],
    date: `${value('year')}-${value('month')}-${value('day')}`,
    time: `${value('hour')}:${value('minute')}:00`,
  };
}

export async function isDriverAvailable(input: {
  organizationId: string;
  driverPersonId: string;
  at: Date;
  direction: string;
}) {
  const db = dbRequired();
  const profile = await db.query(`select * from driver_profiles where person_id=$1 and status='active'`, [input.driverPersonId]);
  if (!profile.rowCount) return false;
  const recurring = await db.query(
    `select * from driver_recurring_availability
     where organization_id=$1 and driver_person_id=$2 and status='active' order by id`,
    [input.organizationId,input.driverPersonId]
  );
  const timeZone = recurring.rows[0]?.time_zone || 'America/Chicago';
  const local = localParts(input.at,timeZone);
  const exception = await db.query(
    `select * from driver_availability_exceptions
     where organization_id=$1 and driver_person_id=$2 and exception_date=$3 limit 1`,
    [input.organizationId,input.driverPersonId,local.date]
  );
  if (exception.rowCount) {
    const row = exception.rows[0];
    if (!row.available) return false;
    if (!row.start_time || !row.end_time) return true;
    return local.time >= String(row.start_time) && local.time <= String(row.end_time);
  }
  if (!recurring.rowCount) return Boolean(profile.rows[0].willing_by_default);
  return recurring.rows.some((row) =>
    Number(row.weekday) === local.weekday &&
    local.time >= String(row.start_time) &&
    local.time <= String(row.end_time) &&
    (row.direction === 'any' || row.direction === input.direction)
  );
}

export async function listDriverProfiles(organizationId: string) {
  const db = dbRequired();
  const result = await db.query(
    `select dp.*,p.display_name,p.preferred_name,
       coalesce((select json_agg(z order by z.created_at) from driver_service_zones z
                 where z.organization_id=$1 and z.driver_person_id=dp.person_id and z.status='active'),'[]'::json) as zones,
       coalesce((select json_agg(a order by a.weekday,a.start_time) from driver_recurring_availability a
                 where a.organization_id=$1 and a.driver_person_id=dp.person_id and a.status='active'),'[]'::json) as recurring_availability
     from driver_profiles dp
     join people p on p.id=dp.person_id
     join memberships m on m.person_id=dp.person_id and m.organization_id=$1 and m.status='active'
     order by coalesce(p.preferred_name,p.display_name),p.display_name`,
    [organizationId]
  );
  return result.rows;
}
