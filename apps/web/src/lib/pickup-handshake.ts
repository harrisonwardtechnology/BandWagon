import crypto from "node:crypto";
import { getDb } from "@/lib/db";
import type { SessionIdentity } from "@/lib/auth";

const COLORS = ["Blue","Pink","Green","Orange","Purple","Yellow"] as const;
const WORDS = ["Cow","Spoon","Rocket","Tiger","Apple","Kite","Panda","Star","Turtle","Drum"] as const;
const ICONS: Record<string,string> = { Cow:"🐄",Spoon:"🥄",Rocket:"🚀",Tiger:"🐯",Apple:"🍎",Kite:"🪁",Panda:"🐼",Star:"⭐",Turtle:"🐢",Drum:"🥁" };
const TTL_MINUTES = 10;

function dbRequired(){const db=getDb();if(!db)throw new Error("Database is not configured");return db;}
function secret(){const value=process.env.AUTH_SECRET||process.env.DATA_ENCRYPTION_KEY;if(!value)throw new Error("AUTH_SECRET or DATA_ENCRYPTION_KEY is required");return value;}
function hash(value:string){return crypto.createHmac("sha256",secret()).update(value).digest("hex");}
function randomItem<T>(values:readonly T[]):T{return values[crypto.randomInt(values.length)];}

async function loadRide(rideId:string){
  const db=dbRequired();
  const result=await db.query(`select r.id,r.public_ref,r.organization_id,r.driver_person_id,r.status,rr.requester_person_id,rr.passenger_person_id,
      o.pickup_verification_mode
    from rides r join ride_requests rr on rr.id=r.ride_request_id join organizations o on o.id=r.organization_id
    where r.id=$1`,[rideId]);
  if(!result.rowCount)throw new Error("Ride not found");
  return result.rows[0];
}

async function canAct(identity:SessionIdentity,ride:any){
  if(identity.personId===ride.driver_person_id||identity.personId===ride.passenger_person_id||identity.personId===ride.requester_person_id)return true;
  const db=dbRequired();
  const guardian=await db.query(`select 1 from guardian_relationships where guardian_person_id=$1 and minor_person_id=$2 and can_manage_profile=true limit 1`,[identity.personId,ride.passenger_person_id]);
  return Boolean(guardian.rowCount);
}

export async function pickupVerificationRequired(rideId:string){
  const ride=await loadRide(rideId);const db=dbRequired();
  if(ride.pickup_verification_mode==='required')return true;
  const guardian=await db.query(`select 1 from guardian_relationships where minor_person_id=$1 and require_verified_pickup=true limit 1`,[ride.passenger_person_id]);
  return Boolean(guardian.rowCount);
}

export async function startPickupHandshake(identity:SessionIdentity,rideId:string){
  const db=dbRequired();const ride=await loadRide(rideId);
  if(!(await canAct(identity,ride)))throw new Error("You are not authorized for this ride");
  if(!['driver_en_route','arrived'].includes(ride.status))throw new Error("Pickup verification becomes available when the driver is en route or has arrived");
  if(ride.pickup_verification_mode==='off'&&!(await pickupVerificationRequired(rideId)))throw new Error("Pickup verification is disabled for this organization");
  await db.query(`update ride_pickup_handshakes set status='expired',updated_at=now() where ride_id=$1 and status in ('pending','driver_confirmed','passenger_confirmed') and expires_at<=now()`,[rideId]);
  const existing=await db.query(`select id,phrase_color,phrase_word,phrase_icon,status,expires_at,driver_confirmed_at,passenger_confirmed_at,verified_at from ride_pickup_handshakes where ride_id=$1 and status in ('pending','driver_confirmed','passenger_confirmed') and expires_at>now() limit 1`,[rideId]);
  if(existing.rowCount)return {...existing.rows[0],token:null,fallbackCode:null,reused:true};
  const token=crypto.randomBytes(32).toString("base64url");
  const fallbackCode=String(crypto.randomInt(1000,10000));
  const color=randomItem(COLORS);const word=randomItem(WORDS);const icon=ICONS[word]||"✓";
  const result=await db.query(`insert into ride_pickup_handshakes
    (ride_id,organization_id,driver_person_id,passenger_person_id,initiated_by_person_id,token_hash,fallback_code_hash,phrase_color,phrase_word,phrase_icon,expires_at)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()+($11||' minutes')::interval)
    returning id,phrase_color,phrase_word,phrase_icon,status,expires_at`,[ride.id,ride.organization_id,ride.driver_person_id,ride.passenger_person_id,identity.personId,hash(`pickup:${token}`),hash(`pickup-code:${ride.id}:${fallbackCode}`),color,word,icon,String(TTL_MINUTES)]);
  await db.query(`insert into ride_pickup_handshake_events(handshake_id,ride_id,actor_person_id,event_type,metadata) values($1,$2,$3,'started',$4::jsonb)`,[result.rows[0].id,ride.id,identity.personId,JSON.stringify({expiresMinutes:TTL_MINUTES})]);
  return {...result.rows[0],token,fallbackCode,reused:false};
}

export async function resolvePickupHandshakeToken(identity:SessionIdentity,token:string){
  const db=dbRequired();
  const result=await db.query(`select h.*,r.public_ref from ride_pickup_handshakes h join rides r on r.id=h.ride_id where h.token_hash=$1 limit 1`,[hash(`pickup:${token}`)]);
  if(!result.rowCount)throw new Error("Pickup verification code is invalid");
  const h=result.rows[0];const ride=await loadRide(h.ride_id);
  if(!(await canAct(identity,ride)))throw new Error("This pickup verification is for another ride");
  if(new Date(h.expires_at).getTime()<=Date.now()||h.status==='expired')throw new Error("Pickup verification has expired");
  return publicHandshake(h,identity.personId);
}

export async function resolvePickupFallbackCode(identity:SessionIdentity,rideId:string,code:string){
  const db=dbRequired();const ride=await loadRide(rideId);if(!(await canAct(identity,ride)))throw new Error("You are not authorized for this ride");
  const result=await db.query(`select * from ride_pickup_handshakes where ride_id=$1 and status in ('pending','driver_confirmed','passenger_confirmed') and expires_at>now() order by created_at desc limit 1`,[rideId]);
  if(!result.rowCount)throw new Error("No active pickup verification");
  const h=result.rows[0];
  const supplied=hash(`pickup-code:${rideId}:${String(code).trim()}`);
  const valid=crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(h.fallback_code_hash));
  if(!valid){await db.query(`insert into ride_pickup_handshake_events(handshake_id,ride_id,actor_person_id,event_type,outcome) values($1,$2,$3,'fallback_code','failed')`,[h.id,rideId,identity.personId]);throw new Error("Pickup verification code does not match");}
  await db.query(`insert into ride_pickup_handshake_events(handshake_id,ride_id,actor_person_id,event_type) values($1,$2,$3,'fallback_code')`,[h.id,rideId,identity.personId]);
  return publicHandshake(h,identity.personId);
}

function publicHandshake(h:any,viewerPersonId:string){return {id:h.id,rideId:h.ride_id,phraseColor:h.phrase_color,phraseWord:h.phrase_word,phraseIcon:h.phrase_icon,status:h.status,expiresAt:h.expires_at,viewerRole:viewerPersonId===h.driver_person_id?'driver':'passenger',driverConfirmedAt:h.driver_confirmed_at,passengerConfirmedAt:h.passenger_confirmed_at,verifiedAt:h.verified_at};}

export async function confirmPickupHandshake(identity:SessionIdentity,handshakeId:string){
  const db=dbRequired();const client=await db.connect();
  try{
    await client.query('BEGIN');
    const result=await client.query(`select * from ride_pickup_handshakes where id=$1 for update`,[handshakeId]);
    if(!result.rowCount)throw new Error("Pickup verification not found");const h=result.rows[0];
    if(new Date(h.expires_at).getTime()<=Date.now()){await client.query(`update ride_pickup_handshakes set status='expired',updated_at=now() where id=$1`,[h.id]);await client.query('COMMIT');throw new Error("Pickup verification has expired");}
    const ride=await loadRide(h.ride_id);if(!(await canAct(identity,ride)))throw new Error("You are not authorized for this pickup verification");
    let role:'driver'|'passenger';
    if(identity.personId===h.driver_person_id)role='driver';else role='passenger';
    await client.query(role==='driver'?`update ride_pickup_handshakes set driver_confirmed_at=coalesce(driver_confirmed_at,now()),updated_at=now() where id=$1`:`update ride_pickup_handshakes set passenger_confirmed_at=coalesce(passenger_confirmed_at,now()),updated_at=now() where id=$1`,[h.id]);
    const refreshed=(await client.query(`select * from ride_pickup_handshakes where id=$1`,[h.id])).rows[0];
    const verified=Boolean(refreshed.driver_confirmed_at&&refreshed.passenger_confirmed_at);
    const status=verified?'verified':role==='driver'?'driver_confirmed':'passenger_confirmed';
    await client.query(`update ride_pickup_handshakes set status=$1,verified_at=case when $1='verified' then coalesce(verified_at,now()) else verified_at end,updated_at=now() where id=$2`,[status,h.id]);
    await client.query(`insert into ride_pickup_handshake_events(handshake_id,ride_id,actor_person_id,event_type,metadata) values($1,$2,$3,$4,$5::jsonb)`,[h.id,h.ride_id,identity.personId,verified?'verified':'confirmed',JSON.stringify({role})]);
    if(verified&&ride.status==='arrived'){
      await client.query(`update rides set status='picked_up',picked_up_at=coalesce(picked_up_at,now()),updated_at=now() where id=$1`,[h.ride_id]);
      await client.query(`insert into ride_status_events(ride_id,ride_request_id,actor_person_id,event_type,from_status,to_status,metadata) select r.id,r.ride_request_id,$2,'pickup_verified','arrived','picked_up',$3::jsonb from rides r where r.id=$1`,[h.ride_id,identity.personId,JSON.stringify({handshakeId:h.id})]);
    }
    await client.query('COMMIT');
    const final=(await db.query(`select * from ride_pickup_handshakes where id=$1`,[h.id])).rows[0];return publicHandshake(final,identity.personId);
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}

export async function getRidePickupHandshake(identity:SessionIdentity,rideId:string){
  const db=dbRequired();const ride=await loadRide(rideId);if(!(await canAct(identity,ride)))throw new Error("You are not authorized for this ride");
  const result=await db.query(`select * from ride_pickup_handshakes where ride_id=$1 order by created_at desc limit 1`,[rideId]);
  return {required:await pickupVerificationRequired(rideId),mode:ride.pickup_verification_mode,handshake:result.rowCount?publicHandshake(result.rows[0],identity.personId):null};
}
