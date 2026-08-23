import { getDb } from "@/lib/db";
import { routeNotification } from "@/lib/notification-router";

function dbRequired() {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

function minutesBetween(a?: Date | string | null, b?: Date | string | null) {
  if (!a || !b) return 0;
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60000;
}

async function actorCanManageRequest(client: any, actorPersonId: string, request: any) {
  if (actorPersonId === request.requester_person_id) return true;
  const guardian = await client.query(
    `select 1 from guardian_relationships
     where guardian_person_id=$1 and minor_person_id=$2 and can_approve_rides=true limit 1`,
    [actorPersonId,request.passenger_person_id]
  );
  return Boolean(guardian.rowCount);
}

async function resequenceStops(client: any, rideId: string) {
  await client.query(
    `with ranked as (
       select id,(row_number() over (
         order by case when stop_type='pickup' then 0 else 1 end,
                  planned_at nulls last,created_at,id
       )*10)::integer as new_sequence
       from ride_stops
       where ride_id=$1 and status<>'skipped'
     )
     update ride_stops rs set sequence=ranked.new_sequence,updated_at=now()
     from ranked where rs.id=ranked.id`,
    [rideId]
  );
}

export async function attachRequestToRide(input: {
  rideId: string;
  rideRequestId: string;
  actorPersonId: string;
}) {
  const db = dbRequired();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const rideResult = await client.query(
      `select r.*,primary_rr.direction as primary_direction,primary_rr.requested_pickup_at as primary_pickup_at,
              dp.allow_multi_passenger,dp.max_detour_minutes
       from rides r
       join ride_requests primary_rr on primary_rr.id=r.ride_request_id
       left join driver_profiles dp on dp.person_id=r.driver_person_id
       where r.id=$1 for update`,
      [input.rideId]
    );
    if (!rideResult.rowCount) throw new Error("Ride not found");
    const ride = rideResult.rows[0];
    if (ride.status !== 'confirmed') throw new Error("Passengers can only be added before the driver departs");
    if (!ride.pooling_enabled || ride.allow_multi_passenger === false) throw new Error("This ride is not accepting additional passengers");

    const requestResult = await client.query(`select * from ride_requests where id=$1 for update`, [input.rideRequestId]);
    if (!requestResult.rowCount) throw new Error("Ride request not found");
    const request = requestResult.rows[0];
    if (request.status !== 'open') throw new Error("Ride request is no longer open");
    if (request.guardian_approval_status === 'pending') throw new Error("Ride request still requires guardian approval");
    if (request.organization_id !== ride.organization_id) throw new Error("Ride and request belong to different organizations");
    if ((request.event_id || null) !== (ride.event_id || null)) throw new Error("Ride and request must be for the same event");
    if (request.direction !== ride.primary_direction) throw new Error("Ride and request directions are not compatible");

    const duplicatePassenger = await client.query(
      `select 1 from ride_passengers where ride_id=$1 and person_id=$2 and assignment_status='confirmed' limit 1`,
      [ride.id,request.passenger_person_id]
    );
    if (duplicatePassenger.rowCount) throw new Error("Passenger is already assigned to this ride");

    const globalMaxGap = Number(process.env.MAX_POOL_TIME_GAP_MINUTES || 45);
    const driverMaxGap = ride.max_detour_minutes == null ? globalMaxGap : Number(ride.max_detour_minutes);
    const allowedGap = Math.max(0,Math.min(globalMaxGap,driverMaxGap));
    if (minutesBetween(request.requested_pickup_at,ride.primary_pickup_at) > allowedGap) {
      throw new Error(`Pickup times differ by more than ${allowedGap} minutes`);
    }

    const remaining = Number(ride.capacity_snapshot) - Number(ride.seats_reserved);
    if (remaining < Number(request.seats_needed)) throw new Error("Ride does not have enough remaining seats");

    const actorIsDriver = input.actorPersonId === ride.driver_person_id;
    const actorCanManage = await actorCanManageRequest(client,input.actorPersonId,request);
    if (!actorIsDriver && !actorCanManage) throw new Error("Person is not authorized to combine this ride request");

    const assignment = await client.query(
      `insert into ride_request_assignments (ride_id,ride_request_id,seats_reserved,status,assigned_by_person_id)
       values ($1,$2,$3,'confirmed',$4)
       on conflict (ride_request_id) do update set
         ride_id=excluded.ride_id,seats_reserved=excluded.seats_reserved,status='confirmed',
         assigned_by_person_id=excluded.assigned_by_person_id,updated_at=now()
       where ride_request_assignments.status='cancelled'
       returning *`,
      [ride.id,request.id,request.seats_needed,input.actorPersonId]
    );
    if (!assignment.rowCount) throw new Error("Ride request is already assigned to another active ride");

    await client.query(
      `insert into ride_passengers (ride_id,person_id,ride_request_id,seats_reserved,assignment_status)
       values ($1,$2,$3,$4,'confirmed')
       on conflict (ride_id,person_id) do update set
         ride_request_id=excluded.ride_request_id,seats_reserved=excluded.seats_reserved,assignment_status='confirmed'`,
      [ride.id,request.passenger_person_id,request.id,request.seats_needed]
    );

    const nextSequence = await client.query(`select coalesce(max(sequence),0)+10 as next_sequence from ride_stops where ride_id=$1`, [ride.id]);
    let sequence = Number(nextSequence.rows[0]?.next_sequence || 10);
    if (request.pickup_location_id) {
      await client.query(
        `insert into ride_stops (ride_id,ride_request_id,person_id,private_location_id,stop_type,sequence,planned_at)
         values ($1,$2,$3,$4,'pickup',$5,$6)`,
        [ride.id,request.id,request.passenger_person_id,request.pickup_location_id,sequence,request.requested_pickup_at]
      );
      sequence += 10;
    }
    if (request.dropoff_location_id) {
      await client.query(
        `insert into ride_stops (ride_id,ride_request_id,person_id,private_location_id,stop_type,sequence,planned_at)
         values ($1,$2,$3,$4,'dropoff',$5,$6)`,
        [ride.id,request.id,request.passenger_person_id,request.dropoff_location_id,sequence,request.requested_dropoff_at]
      );
    }
    await resequenceStops(client,ride.id);

    await client.query(`update rides set seats_reserved=seats_reserved+$1,updated_at=now() where id=$2`, [request.seats_needed,ride.id]);
    await client.query(`update ride_requests set status='matched',updated_at=now() where id=$1`, [request.id]);
    await client.query(
      `insert into ride_status_events (ride_id,ride_request_id,actor_person_id,event_type,from_status,to_status,metadata)
       values ($1,$2,$3,'ride_request_pooled','open','matched',$4::jsonb)`,
      [ride.id,request.id,input.actorPersonId,JSON.stringify({ seatsReserved:request.seats_needed, remainingSeats:remaining-request.seats_needed })]
    );
    await client.query('COMMIT');

    await Promise.allSettled([
      routeNotification({
        notificationType:'ride_matched',
        title:'Carpool confirmed',
        body:'Your ride request was added to a BandWagon carpool.',
        personId:request.requester_person_id,
        organizationId:request.organization_id,
        url:`/rides/${ride.public_ref}`,
      }),
      routeNotification({
        notificationType:'ride_matched',
        title:'Passenger added',
        body:'Another passenger was added to your BandWagon carpool.',
        personId:ride.driver_person_id,
        organizationId:request.organization_id,
        url:`/rides/${ride.public_ref}`,
      }),
    ]);
    return getRideManifest(ride.id);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function removeRequestFromRide(input: {
  rideId: string;
  rideRequestId: string;
  actorPersonId: string;
  reason?: string | null;
}) {
  const db = dbRequired();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const rideResult = await client.query(`select * from rides where id=$1 for update`, [input.rideId]);
    if (!rideResult.rowCount) throw new Error("Ride not found");
    const ride = rideResult.rows[0];
    if (ride.ride_request_id === input.rideRequestId) throw new Error("The primary ride request cannot be removed from its ride");
    if (ride.status !== 'confirmed') throw new Error("Passenger changes are locked after departure");
    const requestResult = await client.query(`select * from ride_requests where id=$1 for update`, [input.rideRequestId]);
    if (!requestResult.rowCount) throw new Error("Ride request not found");
    const request = requestResult.rows[0];
    const actorIsDriver = input.actorPersonId === ride.driver_person_id;
    const actorCanManage = await actorCanManageRequest(client,input.actorPersonId,request);
    if (!actorIsDriver && !actorCanManage) throw new Error("Person is not authorized to remove this passenger");

    const assignment = await client.query(
      `update ride_request_assignments set status='cancelled',updated_at=now()
       where ride_id=$1 and ride_request_id=$2 and status='confirmed' returning seats_reserved`,
      [ride.id,request.id]
    );
    if (!assignment.rowCount) throw new Error("Ride request is not assigned to this ride");
    const seats = Number(assignment.rows[0].seats_reserved || 1);
    await client.query(`update ride_passengers set assignment_status='cancelled' where ride_id=$1 and ride_request_id=$2`, [ride.id,request.id]);
    await client.query(`update ride_stops set status='skipped',updated_at=now() where ride_id=$1 and ride_request_id=$2`, [ride.id,request.id]);
    await resequenceStops(client,ride.id);
    await client.query(`update rides set seats_reserved=greatest(0,seats_reserved-$1),updated_at=now() where id=$2`, [seats,ride.id]);
    await client.query(`update ride_requests set status='open',updated_at=now() where id=$1`, [request.id]);
    await client.query(
      `insert into ride_status_events (ride_id,ride_request_id,actor_person_id,event_type,from_status,to_status,metadata)
       values ($1,$2,$3,'ride_request_unpooled','matched','open',$4::jsonb)`,
      [ride.id,request.id,input.actorPersonId,JSON.stringify({ reason:input.reason || null })]
    );
    await client.query('COMMIT');
    return getRideManifest(ride.id);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function getRideManifest(rideId: string) {
  const db = dbRequired();
  const ride = await db.query(
    `select r.*,p.display_name as driver_name,e.title as event_title,
            greatest(0,r.capacity_snapshot-r.seats_reserved) as remaining_seats
     from rides r join people p on p.id=r.driver_person_id
     left join events e on e.id=r.event_id where r.id=$1`,
    [rideId]
  );
  if (!ride.rowCount) throw new Error("Ride not found");
  const passengers = await db.query(
    `select rp.*,p.display_name,p.preferred_name,rr.public_ref as request_ref,rr.direction,
            rr.requested_pickup_at,rr.requested_dropoff_at
     from ride_passengers rp
     join people p on p.id=rp.person_id
     left join ride_requests rr on rr.id=rp.ride_request_id
     where rp.ride_id=$1 and rp.assignment_status='confirmed'
     order by coalesce(rr.requested_pickup_at,rr.created_at)`,
    [rideId]
  );
  const stops = await db.query(
    `select rs.*,pl.generalized_area,pl.generalized_latitude,pl.generalized_longitude,p.display_name
     from ride_stops rs
     left join private_locations pl on pl.id=rs.private_location_id
     left join people p on p.id=rs.person_id
     where rs.ride_id=$1 and rs.status<>'skipped' order by rs.sequence`,
    [rideId]
  );
  return { ride:ride.rows[0], passengers:passengers.rows, stops:stops.rows };
}

export async function listPoolableRides(organizationId: string) {
  const db = dbRequired();
  const result = await db.query(
    `select r.*,e.title as event_title,p.display_name as driver_name,rr.direction,
            greatest(0,r.capacity_snapshot-r.seats_reserved) as remaining_seats,
            (select count(*)::int from ride_request_assignments a where a.ride_id=r.id and a.status='confirmed') as request_count
     from rides r
     join ride_requests rr on rr.id=r.ride_request_id
     join people p on p.id=r.driver_person_id
     left join events e on e.id=r.event_id
     where r.organization_id=$1 and r.status='confirmed' and r.pooling_enabled=true
     order by coalesce(r.scheduled_pickup_at,e.starts_at),r.created_at`,
    [organizationId]
  );
  return result.rows;
}
