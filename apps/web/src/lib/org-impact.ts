import { getDb } from "@/lib/db";
import type { SessionIdentity } from "@/lib/auth";
import {
  impactCsv,
  impactEstimates,
  impactPeriods,
  normalizeMilesPerTrip,
  normalizeMinutesPerTrip,
  publicImpactRow,
  type ImpactCounts,
} from "@/lib/impact-policy";
import { safeHttpsUrlOrNull } from "@/lib/sponsor-policy";

function dbRequired() {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

export async function getImpactSettings(organizationId: string) {
  const db = dbRequired();
  const row = (await db.query(`select public_impact_enabled,miles_per_avoided_trip,minutes_per_avoided_trip,updated_at from organization_impact_settings where organization_id=$1`, [organizationId])).rows[0];
  return {
    publicImpactEnabled: Boolean(row?.public_impact_enabled),
    milesPerTrip: normalizeMilesPerTrip(row?.miles_per_avoided_trip ?? 5),
    minutesPerTrip: normalizeMinutesPerTrip(row?.minutes_per_avoided_trip ?? 15),
    updatedAt: row?.updated_at || null,
  };
}

/**
 * Aggregate counts only. No names, rides, or locations leave this function.
 * An avoided trip is a ride request served on a completed ride where the
 * requesting family is not the driver's own household (see impact-policy.ts).
 */
async function impactCounts(organizationId: string, since: Date | null): Promise<ImpactCounts> {
  const db = dbRequired();
  const row = (
    await db.query(
      `with completed as (
         select r.id,r.driver_person_id,coalesce(drv.household_id::text,r.driver_person_id::text) as driver_family
           from rides r
           left join people drv on drv.id=r.driver_person_id
          where r.organization_id=$1 and r.status='completed'
            and ($2::timestamptz is null or coalesce(r.completed_at,r.updated_at)>=$2::timestamptz)
       ), served as (
         select c.id as ride_id,c.driver_family,rra.ride_request_id,rra.seats_reserved,
                coalesce(req.household_id::text,rr.requester_person_id::text) as family
           from completed c
           join ride_request_assignments rra on rra.ride_id=c.id and rra.status in ('confirmed','completed')
           join ride_requests rr on rr.id=rra.ride_request_id
           left join people req on req.id=rr.requester_person_id
       ), riders as (
         select distinct rp.person_id
           from completed c
           join ride_passengers rp on rp.ride_id=c.id and rp.no_show=false and rp.assignment_status in ('confirmed','completed')
       ), families as (
         select family as f from served union select driver_family from completed
       )
       select (select count(*) from completed)::int as completed_rides,
              (select count(*) from riders)::int as riders_served,
              (select coalesce(sum(seats_reserved),0) from served where family<>driver_family)::int as seats_shared,
              (select count(distinct ride_request_id) from served where family<>driver_family)::int as avoided_trips,
              (select count(distinct driver_person_id) from completed)::int as active_drivers,
              (select count(*) from families)::int as families_participating`,
      [organizationId, since]
    )
  ).rows[0];
  return {
    completedRides: Number(row?.completed_rides || 0),
    ridersServed: Number(row?.riders_served || 0),
    seatsShared: Number(row?.seats_shared || 0),
    avoidedTrips: Number(row?.avoided_trips || 0),
    activeDrivers: Number(row?.active_drivers || 0),
    familiesParticipating: Number(row?.families_participating || 0),
  };
}

/** Impact rows for all periods, with small-number suppression already applied. */
export async function buildImpactReport(organizationId: string, now = new Date()) {
  const db = dbRequired();
  const org = (await db.query(`select id,coalesce(display_name,name) as name,slug from organizations where id=$1`, [organizationId])).rows[0];
  if (!org) throw new Error("Organization not found");
  const settings = await getImpactSettings(organizationId);
  const periods = impactPeriods(now);
  const rows = [];
  for (const period of periods) {
    const counts = await impactCounts(organizationId, period.start);
    // Only suppressed display values are returned. Exact small counts never leave the server.
    rows.push({ key: period.key, label: period.label, since: period.start ? period.start.toISOString() : null, display: publicImpactRow(counts, settings) });
  }
  return {
    organization: org,
    generatedAt: now.toISOString(),
    settings,
    formulas: {
      avoidedTrip: "One avoided car trip per ride request served on a completed carpool where the family riding is not the driver's own household. Siblings on one request count once, and a round trip counts once.",
      miles: `Vehicle miles avoided = avoided trips x ${settings.milesPerTrip} miles.`,
      hours: `Driving hours saved = avoided trips x ${settings.minutesPerTrip} minutes.`,
      co2: "CO2 avoided = vehicle miles avoided x 400 grams per mile (U.S. EPA typical passenger vehicle).",
      privacy: "Counts from 1 to 4 are shown as \"fewer than 5\", and estimates based on them are not shown.",
    },
    rows,
    sample: impactEstimates({ avoidedTrips: 100, milesPerTrip: settings.milesPerTrip, minutesPerTrip: settings.minutesPerTrip }),
  };
}

export async function buildImpactCsv(organizationId: string) {
  const report = await buildImpactReport(organizationId);
  return {
    filename: `bandwagon-impact-${report.organization.slug || "organization"}-${report.generatedAt.slice(0, 10)}.csv`,
    body: impactCsv({ organizationName: report.organization.name, generatedAt: report.generatedAt, rows: report.rows, milesPerTrip: report.settings.milesPerTrip, minutesPerTrip: report.settings.minutesPerTrip }),
  };
}

export async function updateImpactSettings(identity: SessionIdentity, input: { organizationId: string; publicImpactEnabled: boolean; milesPerTrip?: unknown; minutesPerTrip?: unknown }) {
  const db = dbRequired();
  const miles = normalizeMilesPerTrip(input.milesPerTrip ?? 5);
  const minutes = normalizeMinutesPerTrip(input.minutesPerTrip ?? 15);
  const previous = await getImpactSettings(input.organizationId);
  const saved = (
    await db.query(
      `insert into organization_impact_settings(organization_id,public_impact_enabled,miles_per_avoided_trip,minutes_per_avoided_trip,updated_by_person_id,updated_at)
       values($1,$2,$3,$4,$5,now())
       on conflict(organization_id) do update set public_impact_enabled=excluded.public_impact_enabled,miles_per_avoided_trip=excluded.miles_per_avoided_trip,minutes_per_avoided_trip=excluded.minutes_per_avoided_trip,updated_by_person_id=excluded.updated_by_person_id,updated_at=now()
       returning *`,
      [input.organizationId, Boolean(input.publicImpactEnabled), miles, minutes, identity.personId]
    )
  ).rows[0];
  await db.query(
    `insert into audit_events(organization_id,actor_person_id,action,target_type,target_id,metadata) values($1,$2,'org_impact_settings_updated','organization',$3,$4::jsonb)`,
    [input.organizationId, identity.personId, input.organizationId, JSON.stringify({ previous, publicImpactEnabled: Boolean(input.publicImpactEnabled), milesPerTrip: miles, minutesPerTrip: minutes })]
  );
  return saved;
}

/** Public sponsors: active, marked for public display, and within their dates. Recognition fields only. */
export async function listPublicSponsors(organizationId: string) {
  const db = dbRequired();
  return (
    await db.query(
      `select sponsor_name,sponsor_website,logo_url,tier_label
         from organization_sponsors
        where organization_id=$1 and status='active' and public_display=true
          and starts_at<=now() and (ends_at is null or ends_at>now())
        order by case lower(coalesce(tier_label,'')) when 'gold' then 0 when 'silver' then 1 when 'bronze' then 2 else 3 end, sponsor_name`,
      [organizationId]
    )
  ).rows.map((row) => ({
    sponsor_name: row.sponsor_name,
    tier_label: row.tier_label,
    // Rows created before https validation existed are re-checked on the way out.
    sponsor_website: safeHttpsUrlOrNull(row.sponsor_website),
    logo_url: safeHttpsUrlOrNull(row.logo_url),
  }));
}

/**
 * Slugs of organizations whose public impact page is on, for the sitemap.
 * Same conditions as getPublicImpact: active org and public_impact_enabled=true.
 * Returns [] when no database is configured (for example during a build).
 */
export async function listPublicImpactSlugs(): Promise<string[]> {
  const db = getDb();
  if (!db) return [];
  const rows = (
    await db.query(
      `select o.slug from organizations o
         join organization_impact_settings s on s.organization_id=o.id and s.public_impact_enabled=true
        where o.status='active'
        order by o.slug limit 5000`
    )
  ).rows;
  return rows.map((row) => String(row.slug || "")).filter(Boolean);
}

/** Public impact page data. Returns null unless the organization turned the page on. */
export async function getPublicImpact(slug: string) {
  const db = dbRequired();
  const cleanSlug = String(slug || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 80);
  if (!cleanSlug) return null;
  const org = (
    await db.query(
      `select o.id from organizations o
         join organization_impact_settings s on s.organization_id=o.id and s.public_impact_enabled=true
        where o.slug=$1 and o.status='active' limit 1`,
      [cleanSlug]
    )
  ).rows[0];
  if (!org) return null;
  const report = await buildImpactReport(org.id);
  return {
    organization: { name: report.organization.name, slug: report.organization.slug },
    generatedAt: report.generatedAt,
    formulas: report.formulas,
    // Public view: all time only. Showing two overlapping periods would let anyone
    // subtract them and recover counts under 5 that are meant to be hidden.
    rows: report.rows.filter((row) => row.key === "all_time"),
    sponsors: await listPublicSponsors(org.id),
  };
}
