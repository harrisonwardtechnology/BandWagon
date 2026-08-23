import { getDb } from "@/lib/db";
import type { SessionIdentity } from "@/lib/auth";
import { acceptRideOffer, createRideOffer, createRideRequest, transitionRide } from "@/lib/rides";
import { generateMatchSuggestions } from "@/lib/matching";
import { attachLocationsToRideRequest, createPrivateLocation, getLocationForViewer } from "@/lib/location-privacy";
import { geocodeAddress } from "@/lib/geocoding";

function dbRequired() {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

function assertScope(scopeOrganizationId: string | null | undefined, organizationId: string) {
  if (scopeOrganizationId && scopeOrganizationId !== organizationId) {
    throw new Error("This resource belongs to another BandWagon organization");
  }
}

async function managedPeople(identity: SessionIdentity) {
  const db = dbRequired();
  const result = await db.query(
    `select distinct p.id,p.display_name,p.preferred_name,p.person_type,p.student_approval_required
     from people p
     where p.id=$1
        or exists (
          select 1 from guardian_relationships gr
          where gr.guardian_person_id=$1 and gr.minor_person_id=p.id and gr.can_manage_profile=true
        )
     order by p.person_type,p.display_name`,
    [identity.personId]
  );
  return result.rows;
}

async function assertManagedPassenger(identity: SessionIdentity, personId: string) {
  const people = await managedPeople(identity);
  if (!people.some((p) => p.id === personId)) throw new Error("You cannot manage rides for that person");
}

async function assertOrganization(identity: SessionIdentity, organizationId: string) {
  if (!identity.organizationIds.includes(organizationId)) throw new Error("You are not a member of that organization");
}

export async function getProductDashboard(identity: SessionIdentity, organizationScopeId?: string | null) {
  const db = dbRequired();
  const people = await managedPeople(identity);
  const managedIds = people.map((p) => p.id);
  const organizations = await db.query(
    `select o.id,coalesce(o.display_name,o.name) as name,o.slug,m.role
     from memberships m join organizations o on o.id=m.organization_id
     where m.person_id=$1 and m.group_id is null and m.status='active' and o.status='active'
       and ($2::uuid is null or o.id=$2::uuid)
     order by name`,
    [identity.personId,organizationScopeId || null]
  );
  const organizationIds = organizations.rows.map((o) => o.id);
  const events = organizationIds.length ? await db.query(
    `select e.id,e.organization_id,e.title,e.location_name,e.location_address,e.starts_at,e.ends_at,e.all_day,e.ride_coordination_enabled
     from events e
     where e.organization_id=any($1::uuid[]) and e.status='active' and e.ride_coordination_enabled=true
       and coalesce(e.starts_at,now()) >= now()-interval '1 day'
       and coalesce(e.starts_at,now()) < now()+interval '120 days'
     order by e.starts_at nulls last,e.title limit 150`,
    [organizationIds]
  ) : { rows: [] };
  const requests = managedIds.length && organizationIds.length ? await db.query(
    `select rr.*,e.title as event_title,e.starts_at as event_starts_at,p.display_name as passenger_name,
            ppl.generalized_area as pickup_area,dpl.generalized_area as dropoff_area,
       coalesce((select json_agg(json_build_object('id',ro.id,'driverPersonId',ro.driver_person_id,'driverName',dp.display_name,'status',ro.status,'seatsOffered',ro.seats_offered,'proposedPickupAt',ro.proposed_pickup_at) order by ro.created_at)
                 from ride_offers ro join people dp on dp.id=ro.driver_person_id where ro.ride_request_id=rr.id),'[]'::json) as offers
     from ride_requests rr
     left join events e on e.id=rr.event_id
     join people p on p.id=rr.passenger_person_id
     left join private_locations ppl on ppl.id=rr.pickup_location_id
     left join private_locations dpl on dpl.id=rr.dropoff_location_id
     where rr.passenger_person_id=any($1::uuid[]) and rr.organization_id=any($2::uuid[])
     order by coalesce(e.starts_at,rr.requested_pickup_at,rr.created_at) desc limit 100`,
    [managedIds,organizationIds]
  ) : { rows: [] };
  const rides = managedIds.length && organizationIds.length ? await db.query(
    `select r.*,e.title as event_title,e.starts_at as event_starts_at,d.display_name as driver_name,
            greatest(0,coalesce(r.capacity_snapshot,1)-coalesce(r.seats_reserved,1)) as remaining_seats,
            primary_rr.pickup_location_id as primary_pickup_location_id,
            primary_rr.dropoff_location_id as primary_dropoff_location_id,
            coalesce(
              (select rr2.pickup_location_id
               from ride_request_assignments a2
               join ride_requests rr2 on rr2.id=a2.ride_request_id
               where a2.ride_id=r.id and a2.status='confirmed' and rr2.passenger_person_id=any($2::uuid[])
               order by case when rr2.passenger_person_id=$1 then 0 else 1 end,rr2.created_at limit 1),
              primary_rr.pickup_location_id
            ) as viewer_pickup_location_id,
            coalesce(
              (select rr2.dropoff_location_id
               from ride_request_assignments a2
               join ride_requests rr2 on rr2.id=a2.ride_request_id
               where a2.ride_id=r.id and a2.status='confirmed' and rr2.passenger_person_id=any($2::uuid[])
               order by case when rr2.passenger_person_id=$1 then 0 else 1 end,rr2.created_at limit 1),
              primary_rr.dropoff_location_id
            ) as viewer_dropoff_location_id
     from rides r
     join ride_requests primary_rr on primary_rr.id=r.ride_request_id
     left join events e on e.id=r.event_id
     join people d on d.id=r.driver_person_id
     where r.organization_id=any($3::uuid[])
       and (r.driver_person_id=$1 or exists (
          select 1 from ride_passengers rp
          where rp.ride_id=r.id and rp.assignment_status='confirmed' and rp.person_id=any($2::uuid[])
       ))
     order by coalesce(r.scheduled_pickup_at,e.starts_at,r.created_at) desc limit 100`,
    [identity.personId,managedIds,organizationIds]
  ) : { rows: [] };
  const openRequests = organizationIds.length ? await db.query(
    `select rr.id,rr.public_ref,rr.organization_id,rr.event_id,rr.direction,rr.seats_needed,rr.requested_pickup_at,
            e.title as event_title,e.starts_at as event_starts_at,p.display_name as passenger_name,
            pl.generalized_area as pickup_area
     from ride_requests rr
     join people p on p.id=rr.passenger_person_id
     left join events e on e.id=rr.event_id
     left join private_locations pl on pl.id=rr.pickup_location_id
     where rr.organization_id=any($1::uuid[]) and rr.status='open'
       and rr.passenger_person_id<>all($2::uuid[])
     order by coalesce(rr.requested_pickup_at,e.starts_at,rr.created_at) limit 100`,
    [organizationIds,managedIds]
  ) : { rows: [] };
  const driverProfiles = organizationIds.length ? await db.query(
    `select dos.*,dp.vehicle_label,dp.vehicle_make,dp.vehicle_model,dp.vehicle_color,dp.license_plate_hint,dp.notes
     from driver_organization_settings dos
     join driver_profiles dp on dp.person_id=dos.driver_person_id
     where dos.driver_person_id=$1 and dos.organization_id=any($2::uuid[])
     order by dos.organization_id`,
    [identity.personId,organizationIds]
  ) : { rows: [] };
  return {
    identity,
    people,
    organizations:organizations.rows,
    events:events.rows,
    requests:requests.rows,
    rides:rides.rows,
    openRequests:openRequests.rows,
    driverProfiles:driverProfiles.rows,
    driverProfile:driverProfiles.rows[0] || null,
  };
}

export async function createUserRideRequest(identity: SessionIdentity, input: {
  organizationId: string;
  organizationScopeId?: string | null;
  eventId?: string | null;
  passengerPersonId: string;
  direction: 'to_event' | 'from_event' | 'round_trip' | 'other';
  seatsNeeded?: number;
  requestedPickupAt?: string | null;
  pickupNote?: string | null;
  dropoffNote?: string | null;
  pickupAddress?: string | null;
  dropoffAddress?: string | null;
}) {
  const db = dbRequired();
  assertScope(input.organizationScopeId,input.organizationId);
  await assertOrganization(identity,input.organizationId);
  await assertManagedPassenger(identity,input.passengerPersonId);

  const pickupGeo = input.pickupAddress?.trim() ? await geocodeAddress(input.pickupAddress) : null;
  const dropoffGeo = input.dropoffAddress?.trim() ? await geocodeAddress(input.dropoffAddress) : null;
  const ride = await createRideRequest({
    organizationId:input.organizationId,eventId:input.eventId || null,
    requesterPersonId:identity.personId,passengerPersonId:input.passengerPersonId,
    direction:input.direction,seatsNeeded:input.seatsNeeded || 1,
    requestedPickupAt:input.requestedPickupAt || null,pickupNote:input.pickupNote || null,dropoffNote:input.dropoffNote || null,
  });

  let pickupLocationId: string | null = null;
  let dropoffLocationId: string | null = null;
  if (pickupGeo) {
    const location = await createPrivateLocation({
      organizationId:input.organizationId,ownerPersonId:identity.personId,label:"Pickup",
      address:pickupGeo.formattedAddress,latitude:pickupGeo.latitude,longitude:pickupGeo.longitude,
      generalizedArea:pickupGeo.generalizedArea,revealPolicy:'matched_driver',
    });
    pickupLocationId = location.id;
  }
  if (dropoffGeo) {
    const location = await createPrivateLocation({
      organizationId:input.organizationId,ownerPersonId:identity.personId,label:"Drop-off",
      address:dropoffGeo.formattedAddress,latitude:dropoffGeo.latitude,longitude:dropoffGeo.longitude,
      generalizedArea:dropoffGeo.generalizedArea,revealPolicy:'matched_driver',
    });
    dropoffLocationId = location.id;
  }
  if (pickupLocationId || dropoffLocationId) {
    await attachLocationsToRideRequest({rideRequestId:ride.id,actorPersonId:identity.personId,pickupLocationId,dropoffLocationId});
  }
  await db.query(`update ride_requests set created_via='user',updated_at=now() where id=$1`, [ride.id]);
  await db.query(
    `insert into user_activity_events (user_account_id,person_id,organization_id,activity_type,metadata)
     values ($1,$2,$3,'ride_request_created',$4::jsonb)`,
    [identity.userAccountId,identity.personId,input.organizationId,JSON.stringify({ rideRequestId:ride.id,passengerPersonId:input.passengerPersonId })]
  );
  if (ride.status === 'open') await generateMatchSuggestions({ rideRequestId:ride.id,requestedByPersonId:identity.personId,limit:10 }).catch(()=>null);
  return (await db.query(`select * from ride_requests where id=$1`,[ride.id])).rows[0];
}

export async function offerRideAsCurrentUser(identity: SessionIdentity, input: { rideRequestId:string; organizationScopeId?:string|null; seatsOffered?:number; note?:string|null; proposedPickupAt?:string|null }) {
  const db = dbRequired();
  const request = await db.query(`select organization_id from ride_requests where id=$1`,[input.rideRequestId]);
  if (!request.rowCount) throw new Error("Ride request not found");
  assertScope(input.organizationScopeId,request.rows[0].organization_id);
  await assertOrganization(identity,request.rows[0].organization_id);
  const profile = await db.query(
    `select 1 from driver_organization_settings
     where organization_id=$1 and driver_person_id=$2 and status='active' limit 1`,
    [request.rows[0].organization_id,identity.personId]
  );
  if (!profile.rowCount) throw new Error("Enable your driver profile for this organization before offering a ride");
  return createRideOffer({rideRequestId:input.rideRequestId,driverPersonId:identity.personId,seatsOffered:input.seatsOffered || 1,note:input.note || null,proposedPickupAt:input.proposedPickupAt || null});
}

export async function acceptOfferAsCurrentUser(identity: SessionIdentity, input: { rideRequestId:string; offerId:string; organizationScopeId?:string|null }) {
  const db = dbRequired();
  const request = await db.query(`select organization_id,requester_person_id,passenger_person_id from ride_requests where id=$1`, [input.rideRequestId]);
  if (!request.rowCount) throw new Error("Ride request not found");
  const row = request.rows[0];
  assertScope(input.organizationScopeId,row.organization_id);
  await assertOrganization(identity,row.organization_id);
  if (row.requester_person_id !== identity.personId) await assertManagedPassenger(identity,row.passenger_person_id);
  return acceptRideOffer({ rideRequestId:input.rideRequestId,offerId:input.offerId,actorPersonId:identity.personId });
}

export async function transitionRideAsCurrentUser(identity: SessionIdentity, input:{rideId:string;organizationScopeId?:string|null;toStatus:string;reason?:string|null}) {
  const db = dbRequired();
  const ride = await db.query(`select organization_id,driver_person_id from rides where id=$1`, [input.rideId]);
  if (!ride.rowCount) throw new Error("Ride not found");
  assertScope(input.organizationScopeId,ride.rows[0].organization_id);
  await assertOrganization(identity,ride.rows[0].organization_id);
  if (['driver_en_route','arrived','picked_up','completed'].includes(input.toStatus) && ride.rows[0].driver_person_id !== identity.personId) {
    throw new Error("Only the assigned driver can update the driving status");
  }
  return transitionRide({ rideId:input.rideId,actorPersonId:identity.personId,toStatus:input.toStatus,reason:input.reason || null });
}

export async function refreshUserMatches(identity: SessionIdentity, rideRequestId:string, organizationScopeId?:string|null) {
  const db = dbRequired();
  const request = await db.query(`select organization_id,requester_person_id,passenger_person_id from ride_requests where id=$1`, [rideRequestId]);
  if (!request.rowCount) throw new Error("Ride request not found");
  assertScope(organizationScopeId,request.rows[0].organization_id);
  await assertOrganization(identity,request.rows[0].organization_id);
  if (request.rows[0].requester_person_id !== identity.personId) await assertManagedPassenger(identity,request.rows[0].passenger_person_id);
  return generateMatchSuggestions({ rideRequestId,requestedByPersonId:identity.personId,limit:10 });
}

export async function viewRideLocation(identity: SessionIdentity, input:{locationId:string;rideId?:string|null;organizationScopeId?:string|null}) {
  const db = dbRequired();
  const location = await db.query(`select organization_id from private_locations where id=$1`,[input.locationId]);
  if (!location.rowCount) throw new Error("Location not found");
  assertScope(input.organizationScopeId,location.rows[0].organization_id);
  await assertOrganization(identity,location.rows[0].organization_id);
  return getLocationForViewer({ locationId:input.locationId,actorPersonId:identity.personId,rideId:input.rideId || null });
}
