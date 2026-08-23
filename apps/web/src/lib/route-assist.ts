import { getDb } from "@/lib/db";
import { routeNotification } from "@/lib/notification-router";
import { routeMetrics } from "@/lib/routing-provider";

type Point={lat:number;lng:number};
function dbRequired(){const db=getDb();if(!db)throw new Error("Database is not configured");return db;}
function round(n:number,d=1){const p=10**d;return Math.round(n*p)/p;}
function point(lat:unknown,lng:unknown):Point|null{const a=Number(lat),b=Number(lng);return Number.isFinite(a)&&Number.isFinite(b)?{lat:a,lng:b}:null;}
function haversineMeters(a:Point,b:Point){const rad=(v:number)=>v*Math.PI/180,dLat=rad(b.lat-a.lat),dLng=rad(b.lng-a.lng);const x=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2;return 6371000*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
function candidateStop(direction:string,row:any){return direction==='to_event'?point(row.pickup_lat,row.pickup_lng):direction==='from_event'?point(row.dropoff_lat,row.dropoff_lng):null;}

export async function refreshRouteAssistRecommendations(organizationId:string,driverPersonId:string){
 const db=dbRequired();
 const pref=(await db.query(`select * from driver_organization_settings where organization_id=$1 and driver_person_id=$2 and status='active' and route_assist_enabled=true`,[organizationId,driverPersonId])).rows[0];
 if(!pref)return [];
 const maxExtra=Math.max(0,Number(pref.max_route_extra_minutes||10)),maxDeviation=Math.max(0,Number(pref.max_route_deviation_percent||10));
 const rides=await db.query(`select r.id,r.event_id,r.capacity_snapshot,r.seats_reserved,rr.direction,rr.requested_pickup_at,e.starts_at,
   sp.generalized_latitude as pickup_lat,sp.generalized_longitude as pickup_lng,sd.generalized_latitude as dropoff_lat,sd.generalized_longitude as dropoff_lng
   from rides r join ride_requests rr on rr.id=r.ride_request_id left join events e on e.id=r.event_id
   left join private_locations sp on sp.id=rr.pickup_location_id left join private_locations sd on sd.id=rr.dropoff_location_id
   where r.organization_id=$1 and r.driver_person_id=$2 and r.status in ('confirmed','driver_en_route')
   order by coalesce(r.scheduled_pickup_at,e.starts_at) asc`,[organizationId,driverPersonId]);
 const open=await db.query(`select rr.id,rr.event_id,rr.direction,rr.seats_needed,rr.requested_pickup_at,e.starts_at,e.title,
   cp.generalized_latitude as pickup_lat,cp.generalized_longitude as pickup_lng,cd.generalized_latitude as dropoff_lat,cd.generalized_longitude as dropoff_lng
   from ride_requests rr left join events e on e.id=rr.event_id
   left join private_locations cp on cp.id=rr.pickup_location_id left join private_locations cd on cd.id=rr.dropoff_location_id
   where rr.organization_id=$1 and rr.status='open' and rr.passenger_person_id<>$2 and rr.requester_person_id<>$2`,[organizationId,driverPersonId]);
 const out:any[]=[];
 for(const ride of rides.rows){
  const available=Number(ride.capacity_snapshot||0)-Number(ride.seats_reserved||0);if(available<=0)continue;
  if(!['to_event','from_event'].includes(String(ride.direction)))continue;
  const start=point(ride.pickup_lat,ride.pickup_lng),end=point(ride.dropoff_lat,ride.dropoff_lng);if(!start||!end)continue;
  const straightBaseline=haversineMeters(start,end);if(straightBaseline<100)continue;
  const baseline=await routeMetrics(start,end,{organizationId});
  for(const req of open.rows){
   if(Number(req.seats_needed)>available)continue;if(ride.event_id&&req.event_id&&ride.event_id!==req.event_id)continue;if(ride.direction!==req.direction)continue;
   const stop=candidateStop(String(req.direction),req);if(!stop)continue;
   const cheapAssisted=haversineMeters(start,stop)+haversineMeters(stop,end),cheapDetour=Math.max(0,cheapAssisted-straightBaseline),cheapDeviation=cheapDetour/straightBaseline*100;
   const cheapExtraMinutes=(cheapDetour*1.35/1000/35)*60+2;
   if((maxExtra===0&&cheapDetour>25)||(maxDeviation===0&&cheapDetour>25))continue;
   if(maxExtra>0&&cheapExtraMinutes>maxExtra*2.25)continue;
   if(maxDeviation>0&&cheapDeviation>maxDeviation*2.25)continue;
   const [first,second]=await Promise.all([routeMetrics(start,stop,{organizationId}),routeMetrics(stop,end,{organizationId})]);
   const assistedDistance=first.distanceMeters+second.distanceMeters,assistedDuration=first.durationSeconds+second.durationSeconds;
   const detourMeters=Math.max(0,assistedDistance-baseline.distanceMeters);
   const deviation=baseline.distanceMeters>0?round(detourMeters/baseline.distanceMeters*100,1):100;
   const extraMinutes=Math.max(0,Math.ceil((Math.max(0,assistedDuration-baseline.durationSeconds)+120)/60));
   if(extraMinutes>maxExtra||deviation>maxDeviation)continue;
   const timeShare=maxExtra===0?(extraMinutes===0?0:1):extraMinutes/maxExtra;
   const deviationShare=maxDeviation===0?(deviation===0?0:1):deviation/maxDeviation;
   const score=Math.max(0,Math.min(100,round(100-timeShare*35-deviationShare*25+10,1)));
   const providers=new Set([baseline.provider,first.provider,second.provider]);
   const reasons=["same_event_and_direction","capacity_available","within_time_limit","within_distance_deviation_limit",...Array.from(providers),baseline.cacheHit&&first.cacheHit&&second.cacheHit?"routing_cache_hit":"routing_checked"];
   const row=(await db.query(`insert into driver_ride_recommendations
     (organization_id,driver_person_id,ride_request_id,source_route_id,estimated_baseline_distance_meters,estimated_detour_distance_meters,estimated_deviation_percent,estimated_extra_minutes,score,reason_codes,status,expires_at,updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,'recommended',now()+interval '6 hours',now())
     on conflict (driver_person_id,ride_request_id,source_route_id) do update set
       estimated_baseline_distance_meters=excluded.estimated_baseline_distance_meters,estimated_detour_distance_meters=excluded.estimated_detour_distance_meters,
       estimated_deviation_percent=excluded.estimated_deviation_percent,estimated_extra_minutes=excluded.estimated_extra_minutes,score=excluded.score,reason_codes=excluded.reason_codes,
       status=case when driver_ride_recommendations.status in ('accepted','dismissed') then driver_ride_recommendations.status else 'recommended' end,
       expires_at=excluded.expires_at,updated_at=now() returning *`,[organizationId,driverPersonId,req.id,ride.id,baseline.distanceMeters,Math.round(detourMeters),deviation,extraMinutes,score,JSON.stringify(reasons)])).rows[0];
   if(row.status==='recommended'||row.status==='viewed')out.push({...row,event_title:req.title,seats_needed:req.seats_needed,direction:req.direction,routing_provider:Array.from(providers).join('+'),routing_cache_hit:Boolean(baseline.cacheHit&&first.cacheHit&&second.cacheHit)});
  }
 }
 return out.sort((a,b)=>Number(b.score)-Number(a.score));
}

export async function listRouteAssistRecommendations(organizationId:string,driverPersonId:string){const db=dbRequired();return (await db.query(`select dr.*,rr.public_ref,rr.seats_needed,rr.direction,e.title as event_title from driver_ride_recommendations dr join ride_requests rr on rr.id=dr.ride_request_id left join events e on e.id=rr.event_id where dr.organization_id=$1 and dr.driver_person_id=$2 and dr.status in ('recommended','viewed') and (dr.expires_at is null or dr.expires_at>now()) and rr.status='open' order by dr.score desc,dr.estimated_extra_minutes asc limit 25`,[organizationId,driverPersonId])).rows;}

export async function setRouteAssistRecommendationStatus(input:{recommendationId:string;organizationId:string;driverPersonId:string;status:'viewed'|'accepted'|'dismissed'}){const db=dbRequired();const result=await db.query(`update driver_ride_recommendations set status=$4,updated_at=now() where id=$1 and organization_id=$2 and driver_person_id=$3 and status in ('recommended','viewed') returning *`,[input.recommendationId,input.organizationId,input.driverPersonId,input.status]);if(!result.rowCount)throw new Error("RouteAssist recommendation is no longer active");return result.rows[0];}

export async function notifyRouteAssistMatches(organizationId:string,driverPersonId:string){
 const db=dbRequired();const pref=(await db.query(`select route_assist_notify from driver_organization_settings where organization_id=$1 and driver_person_id=$2`,[organizationId,driverPersonId])).rows[0];if(!pref?.route_assist_notify)return[];
 const rows=(await db.query(`select dr.*,rr.seats_needed,rr.direction,e.title as event_title from driver_ride_recommendations dr join ride_requests rr on rr.id=dr.ride_request_id left join events e on e.id=rr.event_id where dr.organization_id=$1 and dr.driver_person_id=$2 and dr.status in ('recommended','viewed') and dr.notified_at is null and (dr.expires_at is null or dr.expires_at>now()) and rr.status='open' and dr.score>=75 order by dr.score desc,dr.created_at asc limit 3`,[organizationId,driverPersonId])).rows;
 const sent=[];
 for(const row of rows){
  await db.query(`update driver_ride_recommendations set notification_attempted_at=now(),updated_at=now() where id=$1 and notified_at is null`,[row.id]);
  const miles=round(Number(row.estimated_detour_distance_meters||0)/1609.344,1);
  const result=await routeNotification({notificationType:'new_ride_available',title:'Almost on your way',body:`A rider needs help${row.event_title?` getting to ${row.event_title}`:''}. About +${row.estimated_extra_minutes} min · +${row.estimated_deviation_percent}% · +${miles} mi.`,personId:driverPersonId,organizationId,url:'/app/driver'}).catch(error=>({error:error instanceof Error?error.message:'Notification failed'}));
  const delivered=Boolean((result as any)?.push?.accepted||(result as any)?.email?.accepted||(result as any)?.messaging?.accepted);
  await db.query(`update driver_ride_recommendations set notified_at=case when $2 then now() else notified_at end,notification_result=$3::jsonb,updated_at=now() where id=$1`,[row.id,delivered,JSON.stringify(result)]);
  sent.push({recommendationId:row.id,delivered,result});
 }
 return sent;
}
