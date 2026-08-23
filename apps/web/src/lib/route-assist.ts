import { getDb } from "@/lib/db";
import { routeNotification } from "@/lib/notification-router";
import { routeMetrics } from "@/lib/routing-provider";

function dbRequired(){const db=getDb();if(!db)throw new Error("Database is not configured");return db;}
function round(n:number,d=1){const p=10**d;return Math.round(n*p)/p;}

export async function refreshRouteAssistRecommendations(organizationId:string,driverPersonId:string){
 const db=dbRequired();
 const pref=(await db.query(`select * from driver_organization_settings where organization_id=$1 and driver_person_id=$2 and status='active' and route_assist_enabled=true`,[organizationId,driverPersonId])).rows[0];
 if(!pref)return [];
 const rides=await db.query(`select r.id,r.event_id,r.capacity_snapshot,r.seats_reserved,rr.direction,rr.requested_pickup_at,e.starts_at,pl.generalized_latitude as lat,pl.generalized_longitude as lng from rides r join ride_requests rr on rr.id=r.ride_request_id left join events e on e.id=r.event_id left join private_locations pl on pl.id=rr.pickup_location_id where r.organization_id=$1 and r.driver_person_id=$2 and r.status in ('confirmed','driver_en_route') order by coalesce(r.scheduled_pickup_at,e.starts_at) asc`,[organizationId,driverPersonId]);
 const open=await db.query(`select rr.id,rr.event_id,rr.direction,rr.seats_needed,rr.requested_pickup_at,e.starts_at,e.title,p.display_name as passenger_name,pl.generalized_latitude as lat,pl.generalized_longitude as lng from ride_requests rr left join events e on e.id=rr.event_id join people p on p.id=rr.passenger_person_id left join private_locations pl on pl.id=rr.pickup_location_id where rr.organization_id=$1 and rr.status='open' and rr.passenger_person_id<>$2 and rr.requester_person_id<>$2`,[organizationId,driverPersonId]);
 const out:any[]=[];
 for(const ride of rides.rows){
  const available=Number(ride.capacity_snapshot||0)-Number(ride.seats_reserved||0);if(available<=0)continue;
  for(const req of open.rows){
   if(Number(req.seats_needed)>available)continue;if(ride.event_id&&req.event_id&&ride.event_id!==req.event_id)continue;if(ride.direction!==req.direction)continue;if(ride.lat==null||ride.lng==null||req.lat==null||req.lng==null)continue;
   const route=await routeMetrics({lat:Number(ride.lat),lng:Number(ride.lng)},{lat:Number(req.lat),lng:Number(req.lng)},{organizationId});
   const detourKm=route.distanceMeters/1000,extraMinutes=Math.ceil(route.durationSeconds/60+2);
   const baselineMinutes=Math.max(10,Math.abs(new Date(ride.requested_pickup_at||ride.starts_at||Date.now()).getTime()-new Date(req.requested_pickup_at||req.starts_at||Date.now()).getTime())/60000+30);
   const deviation=round((extraMinutes/baselineMinutes)*100,1);
   if(extraMinutes>Number(pref.max_route_extra_minutes||10)||deviation>Number(pref.max_route_deviation_percent||10))continue;
   const score=Math.max(0,Math.min(100,round(100-(extraMinutes/Math.max(1,Number(pref.max_route_extra_minutes||10))*35)-(deviation/Math.max(1,Number(pref.max_route_deviation_percent||10))*25)+10,1)));
   const reasons=["same_event_or_route","capacity_available","within_time_limit","within_deviation_limit",route.provider,route.cacheHit?"routing_cache_hit":"routing_live_check"];
   const row=(await db.query(`insert into driver_ride_recommendations (organization_id,driver_person_id,ride_request_id,source_route_id,estimated_detour_distance_meters,estimated_deviation_percent,estimated_extra_minutes,score,reason_codes,status,expires_at,updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,'recommended',now()+interval '6 hours',now()) on conflict (driver_person_id,ride_request_id,source_route_id) do update set estimated_detour_distance_meters=excluded.estimated_detour_distance_meters,estimated_deviation_percent=excluded.estimated_deviation_percent,estimated_extra_minutes=excluded.estimated_extra_minutes,score=excluded.score,reason_codes=excluded.reason_codes,status=case when driver_ride_recommendations.status in ('accepted','dismissed') then driver_ride_recommendations.status else 'recommended' end,expires_at=excluded.expires_at,updated_at=now() returning *`,[organizationId,driverPersonId,req.id,ride.id,route.distanceMeters,deviation,extraMinutes,score,JSON.stringify(reasons)])).rows[0];
   out.push({...row,event_title:req.title,passenger_name:req.passenger_name,routing_provider:route.provider,routing_cache_hit:Boolean(route.cacheHit)});
  }
 }
 return out.sort((a,b)=>Number(b.score)-Number(a.score));
}

export async function listRouteAssistRecommendations(organizationId:string,driverPersonId:string){const db=dbRequired();return (await db.query(`select dr.*,rr.public_ref,rr.seats_needed,rr.direction,e.title as event_title,p.display_name as passenger_name from driver_ride_recommendations dr join ride_requests rr on rr.id=dr.ride_request_id join people p on p.id=rr.passenger_person_id left join events e on e.id=rr.event_id where dr.organization_id=$1 and dr.driver_person_id=$2 and dr.status in ('recommended','viewed') and (dr.expires_at is null or dr.expires_at>now()) and rr.status='open' order by dr.score desc,dr.estimated_extra_minutes asc limit 25`,[organizationId,driverPersonId])).rows;}

export async function notifyRouteAssistMatches(organizationId:string,driverPersonId:string){const db=dbRequired();const pref=(await db.query(`select route_assist_notify from driver_organization_settings where organization_id=$1 and driver_person_id=$2`,[organizationId,driverPersonId])).rows[0];if(!pref?.route_assist_notify)return[];const rows=await listRouteAssistRecommendations(organizationId,driverPersonId);const sent=[];for(const row of rows.filter((x:any)=>Number(x.score)>=75).slice(0,3)){const miles=round(Number(row.estimated_detour_distance_meters||0)/1609.344,1);const result=await routeNotification({notificationType:'new_ride_available',title:'Almost on your way',body:`${row.passenger_name} needs a ride${row.event_title?` to ${row.event_title}`:''}. About +${row.estimated_extra_minutes} min · +${row.estimated_deviation_percent}% · ${miles} mi.`,personId:driverPersonId,organizationId,url:'/app/driver'}).catch(()=>null);sent.push({recommendationId:row.id,result});}return sent;}
