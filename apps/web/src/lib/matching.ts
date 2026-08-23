import { getDb } from "@/lib/db";
import { isDriverAvailable } from "@/lib/drivers";
import { routeNotification } from "@/lib/notification-router";

function dbRequired() {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(bLat-aLat);
  const dLng = toRad(bLng-aLng);
  const x = Math.sin(dLat/2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng/2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}

function minutesBetween(a?: Date | string | null, b?: Date | string | null) {
  if (!a || !b) return null;
  return Math.round(Math.abs(new Date(a).getTime()-new Date(b).getTime())/60000);
}

function clampScore(value: number) {
  return Math.max(0,Math.min(100,Math.round(value*100)/100));
}

export type MatchSuggestion = {
  candidateType: 'driver' | 'existing_ride';
  driverPersonId: string;
  rideId?: string | null;
  score: number;
  distanceKm?: number | null;
  timeGapMinutes?: number | null;
  remainingCapacity: number;
  rationale: Record<string,unknown>;
};

async function loadRequest(rideRequestId: string) {
  const db = dbRequired();
  const result = await db.query(
    `select rr.*,e.title as event_title,e.starts_at as event_starts_at,
            pl.generalized_area as pickup_area,pl.generalized_latitude as pickup_latitude,pl.generalized_longitude as pickup_longitude
     from ride_requests rr
     left join events e on e.id=rr.event_id
     left join private_locations pl on pl.id=rr.pickup_location_id
     where rr.id=$1`,
    [rideRequestId]
  );
  if (!result.rowCount) throw new Error("Ride request not found");
  const request = result.rows[0];
  if (request.status !== 'open') throw new Error("Ride request is not open for matching");
  if (request.guardian_approval_status === 'pending') throw new Error("Ride request requires guardian approval before matching");
  return request;
}

async function driverHasConflict(driverPersonId: string, targetAt: Date) {
  const db = dbRequired();
  const windowMinutes = Math.max(15,Math.min(360,Number(process.env.DRIVER_CONFLICT_WINDOW_MINUTES || 120)));
  const result = await db.query(
    `select 1 from rides r left join events e on e.id=r.event_id
     where r.driver_person_id=$1
       and r.status in ('confirmed','driver_en_route','arrived','picked_up')
       and coalesce(r.scheduled_pickup_at,e.starts_at) is not null
       and abs(extract(epoch from (coalesce(r.scheduled_pickup_at,e.starts_at)-$2::timestamptz))/60)<=$3
     limit 1`,
    [driverPersonId,targetAt,windowMinutes]
  );
  return Boolean(result.rowCount);
}

async function driverSuggestions(request: any) {
  const db = dbRequired();
  const drivers = await db.query(
    `select dos.driver_person_id as person_id,dos.default_capacity,dos.status,dos.willing_by_default,
            dos.allow_multi_passenger,dos.max_detour_minutes,dos.max_pickup_radius_km,p.display_name,
       coalesce((select json_agg(z) from driver_service_zones z
                 where z.organization_id=$1 and z.driver_person_id=dos.driver_person_id and z.status='active'),'[]'::json) as zones
     from driver_organization_settings dos
     join people p on p.id=dos.driver_person_id
     join memberships m on m.person_id=dos.driver_person_id and m.organization_id=$1 and m.status='active'
     where dos.organization_id=$1 and dos.status='active'
       and dos.driver_person_id<>$2 and dos.driver_person_id<>$3`,
    [request.organization_id,request.passenger_person_id,request.requester_person_id]
  );
  const targetAt = new Date(request.requested_pickup_at || request.event_starts_at || Date.now());
  const suggestions: MatchSuggestion[] = [];
  for (const driver of drivers.rows) {
    if (Number(driver.default_capacity) < Number(request.seats_needed)) continue;
    if (await driverHasConflict(driver.person_id,targetAt)) continue;
    const available = await isDriverAvailable({organizationId:request.organization_id,driverPersonId:driver.person_id,at:targetAt,direction:request.direction});
    if (!available) continue;

    const zones = Array.isArray(driver.zones) ? driver.zones : [];
    let distanceKm: number | null = null;
    let zoneScore = zones.length ? 0 : 15;
    let zoneLabel: string | null = null;
    if (request.pickup_latitude != null && request.pickup_longitude != null && zones.length) {
      const distances = zones.map((zone: any) => ({
        zone,
        distance:haversineKm(Number(request.pickup_latitude),Number(request.pickup_longitude),Number(zone.generalized_latitude),Number(zone.generalized_longitude)),
      })).sort((a:any,b:any)=>a.distance-b.distance);
      const closest = distances[0];
      distanceKm = closest.distance;
      zoneLabel = closest.zone.label;
      if (closest.distance > Number(closest.zone.radius_km)) continue;
      zoneScore = 25 * Math.max(0,1-(closest.distance/Math.max(0.25,Number(closest.zone.radius_km))));
    }

    const spareSeats = Number(driver.default_capacity)-Number(request.seats_needed);
    const capacityScore = 20 * (1-Math.min(1,spareSeats/12));
    const poolingScore = driver.allow_multi_passenger ? 15 : 5;
    const score = clampScore(40+zoneScore+capacityScore+poolingScore);
    suggestions.push({
      candidateType:'driver',driverPersonId:driver.person_id,score,distanceKm,timeGapMinutes:0,
      remainingCapacity:Number(driver.default_capacity)-Number(request.seats_needed),
      rationale:{driverName:driver.display_name,available:true,scheduleConflict:false,willingByDefault:Boolean(driver.willing_by_default),zone:zoneLabel,pickupArea:request.pickup_area || null,capacity:Number(driver.default_capacity),seatsNeeded:Number(request.seats_needed),multiPassenger:Boolean(driver.allow_multi_passenger)},
    });
  }
  return suggestions;
}

async function existingRideSuggestions(request: any) {
  const db = dbRequired();
  const rides = await db.query(
    `select r.*,primary_rr.direction as primary_direction,primary_rr.requested_pickup_at as primary_pickup_at,
            primary_pl.generalized_latitude as primary_pickup_latitude,
            primary_pl.generalized_longitude as primary_pickup_longitude,
            p.display_name as driver_name,
            coalesce(dos.max_detour_minutes,15) as max_detour_minutes,
            coalesce(dos.max_pickup_radius_km,8) as max_pickup_radius_km,
            coalesce(dos.allow_multi_passenger,true) as allow_multi_passenger
     from rides r
     join ride_requests primary_rr on primary_rr.id=r.ride_request_id
     join people p on p.id=r.driver_person_id
     left join driver_organization_settings dos
       on dos.organization_id=r.organization_id and dos.driver_person_id=r.driver_person_id
     left join private_locations primary_pl on primary_pl.id=primary_rr.pickup_location_id
     where r.organization_id=$1 and r.status='confirmed' and r.pooling_enabled=true
       and coalesce(dos.allow_multi_passenger,true)=true
       and ((r.event_id is null and $2::uuid is null) or r.event_id=$2::uuid)
       and primary_rr.direction=$3 and r.seats_reserved+$4<=r.capacity_snapshot`,
    [request.organization_id,request.event_id || null,request.direction,request.seats_needed]
  );
  const suggestions: MatchSuggestion[] = [];
  const maxPoolGap = Number(process.env.MAX_POOL_TIME_GAP_MINUTES || 45);
  for (const ride of rides.rows) {
    const gap = minutesBetween(request.requested_pickup_at || request.event_starts_at,ride.primary_pickup_at || ride.scheduled_pickup_at) || 0;
    const driverDetour = ride.max_detour_minutes == null ? maxPoolGap : Number(ride.max_detour_minutes);
    const allowedGap = Math.max(0,Math.min(maxPoolGap,driverDetour));
    if (gap > allowedGap) continue;
    let distanceKm: number | null = null;
    if (request.pickup_latitude != null && request.pickup_longitude != null && ride.primary_pickup_latitude != null && ride.primary_pickup_longitude != null) {
      distanceKm = haversineKm(Number(request.pickup_latitude),Number(request.pickup_longitude),Number(ride.primary_pickup_latitude),Number(ride.primary_pickup_longitude));
      if (distanceKm > Number(ride.max_pickup_radius_km || 8)) continue;
    }
    const remainingBefore = Number(ride.capacity_snapshot)-Number(ride.seats_reserved);
    const remainingAfter = remainingBefore-Number(request.seats_needed);
    const timeScore = allowedGap === 0 ? 20 : 20*Math.max(0,1-(gap/allowedGap));
    const distanceScore = distanceKm == null ? 15 : 20*Math.max(0,1-(distanceKm/Math.max(0.25,Number(ride.max_pickup_radius_km || 8))));
    const capacityScore = 10*Math.max(0,1-(remainingAfter/Math.max(1,Number(ride.capacity_snapshot))));
    const score = clampScore(50+timeScore+distanceScore+capacityScore);
    suggestions.push({candidateType:'existing_ride',driverPersonId:ride.driver_person_id,rideId:ride.id,score,distanceKm,timeGapMinutes:gap,remainingCapacity:remainingAfter,rationale:{driverName:ride.driver_name,existingCarpool:true,timeGapMinutes:gap,seatsAvailableBefore:remainingBefore,seatsAvailableAfter:remainingAfter,pickupArea:request.pickup_area || null}});
  }
  return suggestions;
}

export async function generateMatchSuggestions(input: {rideRequestId:string;requestedByPersonId?:string|null;limit?:number}) {
  const db = dbRequired();
  const request = await loadRequest(input.rideRequestId);
  const [drivers,pools] = await Promise.all([driverSuggestions(request),existingRideSuggestions(request)]);
  const all = [...pools,...drivers].sort((a,b)=>b.score-a.score);
  const limit = Math.max(1,Math.min(25,Number(input.limit || 10)));
  const selected = all.slice(0,limit);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(`update match_suggestions set status='expired',updated_at=now() where ride_request_id=$1 and status='active'`,[request.id]);
    const run = await client.query(
      `insert into matching_runs (organization_id,ride_request_id,requested_by_person_id,candidate_count,suggestion_count,parameters)
       values ($1,$2,$3,$4,$5,$6::jsonb) returning *`,
      [request.organization_id,request.id,input.requestedByPersonId || null,all.length,selected.length,JSON.stringify({limit,maxPoolTimeGapMinutes:Number(process.env.MAX_POOL_TIME_GAP_MINUTES || 45),driverConflictWindowMinutes:Number(process.env.DRIVER_CONFLICT_WINDOW_MINUTES || 120)})]
    );
    const stored = [];
    for (const suggestion of selected) {
      const row = await client.query(
        `insert into match_suggestions
          (matching_run_id,organization_id,ride_request_id,candidate_type,driver_person_id,ride_id,score,distance_km,time_gap_minutes,remaining_capacity,rationale)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb) returning *`,
        [run.rows[0].id,request.organization_id,request.id,suggestion.candidateType,suggestion.driverPersonId,suggestion.rideId || null,suggestion.score,suggestion.distanceKm ?? null,suggestion.timeGapMinutes ?? null,suggestion.remainingCapacity,JSON.stringify(suggestion.rationale)]
      );
      stored.push(row.rows[0]);
    }
    await client.query('COMMIT');
    return { run:run.rows[0], suggestions:stored };
  } catch (error) {
    await client.query('ROLLBACK').catch(()=>{});
    throw error;
  } finally { client.release(); }
}

export async function listMatchSuggestions(organizationId: string, rideRequestId?: string | null) {
  const db = dbRequired();
  const values: unknown[] = [organizationId];
  let filter = `ms.organization_id=$1 and ms.status='active' and ms.expires_at>now()`;
  if (rideRequestId) { values.push(rideRequestId); filter += ` and ms.ride_request_id=$2`; }
  const result = await db.query(
    `select ms.*,p.display_name as driver_name,rr.public_ref as request_ref,e.title as event_title,r.public_ref as ride_ref
     from match_suggestions ms join people p on p.id=ms.driver_person_id join ride_requests rr on rr.id=ms.ride_request_id
     left join events e on e.id=rr.event_id left join rides r on r.id=ms.ride_id
     where ${filter} order by ms.ride_request_id,ms.score desc,ms.created_at desc`, values);
  return result.rows;
}

export async function dismissMatchSuggestion(suggestionId: string) {
  const db = dbRequired();
  const result = await db.query(`update match_suggestions set status='dismissed',updated_at=now() where id=$1 and status='active' returning *`,[suggestionId]);
  if (!result.rowCount) throw new Error("Active suggestion not found");
  return result.rows[0];
}

export async function notifyTopDriverMatches(input: { rideRequestId: string; limit?: number }) {
  const db = dbRequired();
  const limit = Math.max(1,Math.min(10,Number(input.limit || 3)));
  const rows = await db.query(
    `select ms.*,rr.organization_id,rr.public_ref,e.title as event_title
     from match_suggestions ms join ride_requests rr on rr.id=ms.ride_request_id left join events e on e.id=rr.event_id
     where ms.ride_request_id=$1 and ms.status='active' and ms.expires_at>now() and ms.candidate_type='driver'
     order by ms.score desc limit $2`,[input.rideRequestId,limit]);
  const results = [];
  for (const row of rows.rows) {
    const result = await routeNotification({notificationType:'new_ride_available',title:'Ride help needed',body:`A BandWagon ride${row.event_title ? ` for ${row.event_title}` : ''} may be a good fit for you.`,personId:row.driver_person_id,organizationId:row.organization_id,url:`/rides/requests/${row.public_ref}`}).catch((error)=>({ error:error instanceof Error ? error.message : 'notification failed' }));
    results.push({ suggestionId:row.id,driverPersonId:row.driver_person_id,result });
  }
  return results;
}
