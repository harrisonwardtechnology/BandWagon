import { getDb } from "@/lib/db";
import { encryptSensitive, decryptSensitive } from "@/lib/data-security";

function dbRequired() {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

function generalizedCoordinate(value: number) {
  return Math.round(value * 100) / 100;
}

export async function createPrivateLocation(input: {
  organizationId: string;
  ownerPersonId?: string | null;
  label?: string | null;
  address: string;
  latitude?: number | null;
  longitude?: number | null;
  generalizedArea?: string | null;
  revealPolicy?: 'never' | 'matched_driver' | 'ride_participants';
}) {
  const db = dbRequired();
  const address = input.address.trim();
  if (!address) throw new Error("Address is required");
  const result = await db.query(
    `insert into private_locations
      (organization_id,owner_person_id,label,address_ciphertext,latitude_ciphertext,longitude_ciphertext,
       generalized_area,generalized_latitude,generalized_longitude,reveal_policy)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id,organization_id,owner_person_id,label,
       generalized_area,generalized_latitude,generalized_longitude,reveal_policy,status,created_at`,
    [input.organizationId,input.ownerPersonId || null,input.label || null,encryptSensitive(address),
     input.latitude == null ? null : encryptSensitive(String(input.latitude)),
     input.longitude == null ? null : encryptSensitive(String(input.longitude)),
     input.generalizedArea || null,
     input.latitude == null ? null : generalizedCoordinate(input.latitude),
     input.longitude == null ? null : generalizedCoordinate(input.longitude),
     input.revealPolicy || 'matched_driver']
  );
  return result.rows[0];
}

async function canReveal(locationId: string, actorPersonId: string, rideId?: string | null) {
  const db = dbRequired();
  const loc = await db.query(`select * from private_locations where id=$1 and status='active'`, [locationId]);
  if (!loc.rowCount) return { granted:false, reason:'location_not_found', location:null };
  const location = loc.rows[0];
  if (location.owner_person_id === actorPersonId) return { granted:true, reason:'owner', location };
  if (location.reveal_policy === 'never') return { granted:false, reason:'policy_never', location };
  if (!rideId) return { granted:false, reason:'ride_required', location };
  const ride = await db.query(
    `select r.driver_person_id,rr.requester_person_id,rr.passenger_person_id
     from rides r join ride_requests rr on rr.id=r.ride_request_id
     where r.id=$1 and (rr.pickup_location_id=$2 or rr.dropoff_location_id=$2)`, [rideId,locationId]
  );
  if (!ride.rowCount) return { granted:false, reason:'ride_not_linked', location };
  const row = ride.rows[0];
  if (location.reveal_policy === 'matched_driver' && row.driver_person_id === actorPersonId) return { granted:true, reason:'matched_driver', location };
  if (location.reveal_policy === 'ride_participants' && [row.driver_person_id,row.requester_person_id,row.passenger_person_id].includes(actorPersonId)) return { granted:true, reason:'ride_participant', location };
  return { granted:false, reason:'not_authorized', location };
}

export async function getLocationForViewer(input: { locationId:string; actorPersonId:string; rideId?:string | null }) {
  const db = dbRequired();
  const access = await canReveal(input.locationId,input.actorPersonId,input.rideId);
  await db.query(`insert into location_access_events (private_location_id,ride_id,actor_person_id,access_type,granted,metadata)
    values ($1,$2,$3,'exact_address',$4,$5::jsonb)`, [input.locationId,input.rideId || null,input.actorPersonId,access.granted,JSON.stringify({reason:access.reason})]);
  if (!access.location) throw new Error("Location not found");
  const base = {
    id: access.location.id,
    label: access.location.label,
    generalizedArea: access.location.generalized_area,
    generalizedLatitude: access.location.generalized_latitude,
    generalizedLongitude: access.location.generalized_longitude,
    exactAddressVisible: access.granted,
  };
  if (!access.granted) return base;
  return {
    ...base,
    address: decryptSensitive(access.location.address_ciphertext),
    latitude: access.location.latitude_ciphertext ? Number(decryptSensitive(access.location.latitude_ciphertext)) : null,
    longitude: access.location.longitude_ciphertext ? Number(decryptSensitive(access.location.longitude_ciphertext)) : null,
  };
}

export async function attachLocationsToRideRequest(input:{rideRequestId:string;actorPersonId:string;pickupLocationId?:string|null;dropoffLocationId?:string|null}) {
  const db = dbRequired();
  const rr = await db.query(`select requester_person_id,passenger_person_id from ride_requests where id=$1`,[input.rideRequestId]);
  if (!rr.rowCount) throw new Error("Ride request not found");
  if (rr.rows[0].requester_person_id !== input.actorPersonId) {
    const guardian = await db.query(`select 1 from guardian_relationships where guardian_person_id=$1 and minor_person_id=$2 and can_approve_rides=true`,[input.actorPersonId,rr.rows[0].passenger_person_id]);
    if (!guardian.rowCount) throw new Error("Not authorized to set ride locations");
  }
  const result = await db.query(`update ride_requests set pickup_location_id=$1,dropoff_location_id=$2,updated_at=now() where id=$3 returning *`,[input.pickupLocationId || null,input.dropoffLocationId || null,input.rideRequestId]);
  return result.rows[0];
}
