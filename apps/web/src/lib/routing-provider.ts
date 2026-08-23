import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";

type Point={lat:number;lng:number};
export type RouteMetrics={distanceMeters:number;durationSeconds:number;provider:'google_routes'|'estimate';cacheHit?:boolean};
type RouteContext={organizationId?:string|null};

function db(){return getDb();}
function haversineKm(a:Point,b:Point){const r=(v:number)=>v*Math.PI/180,dLat=r(b.lat-a.lat),dLng=r(b.lng-a.lng);const x=Math.sin(dLat/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLng/2)**2;return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
function estimate(a:Point,b:Point):RouteMetrics{const roadKm=haversineKm(a,b)*1.35;return{distanceMeters:Math.round(roadKm*1000),durationSeconds:Math.max(60,Math.round((roadKm/35)*3600)),provider:'estimate'};}
function routeHash(a:Point,b:Point){const normalized=[a.lat,a.lng,b.lat,b.lng].map(v=>Number(v).toFixed(4)).join('|');return createHash('sha256').update(`drive|${normalized}`).digest('hex');}
function cacheMinutes(){return Math.max(1,Math.min(120,Number(process.env.ROUTING_CACHE_MINUTES||15)));}
function googleCostMicrousd(){return Math.max(0,Math.round(Number(process.env.GOOGLE_ROUTES_ESTIMATED_COST_USD_PER_CALL||0)*1_000_000));}

async function recordUsage(context:RouteContext|undefined,provider:'google_routes'|'estimate',input:{request?:boolean;cacheHit?:boolean;fallback?:boolean;costMicrousd?:number}){
 const database=db();if(!database||!context?.organizationId)return;
 await database.query(`insert into routing_usage_daily (usage_date,organization_id,provider,request_count,cache_hits,fallback_count,estimated_cost_microusd,updated_at)
 values (current_date,$1,$2,$3,$4,$5,$6,now())
 on conflict (usage_date,organization_id,provider) do update set
 request_count=routing_usage_daily.request_count+excluded.request_count,
 cache_hits=routing_usage_daily.cache_hits+excluded.cache_hits,
 fallback_count=routing_usage_daily.fallback_count+excluded.fallback_count,
 estimated_cost_microusd=routing_usage_daily.estimated_cost_microusd+excluded.estimated_cost_microusd,
 updated_at=now()`,[context.organizationId,provider,input.request?1:0,input.cacheHit?1:0,input.fallback?1:0,input.costMicrousd||0]).catch(()=>null);
}

async function cached(hash:string,context?:RouteContext):Promise<RouteMetrics|null>{
 const database=db();if(!database)return null;
 const result=await database.query(`select provider,distance_meters,duration_seconds from routing_cache where route_hash=$1 and expires_at>now() limit 1`,[hash]).catch(()=>null);
 const row=result?.rows?.[0];if(!row)return null;
 const provider=row.provider==='google_routes'?'google_routes':'estimate';await recordUsage(context,provider,{cacheHit:true});
 return{distanceMeters:Number(row.distance_meters),durationSeconds:Number(row.duration_seconds),provider,cacheHit:true};
}

async function cache(hash:string,metrics:RouteMetrics){const database=db();if(!database)return;await database.query(`insert into routing_cache(route_hash,provider,distance_meters,duration_seconds,expires_at) values($1,$2,$3,$4,now()+($5::text||' minutes')::interval) on conflict(route_hash) do update set provider=excluded.provider,distance_meters=excluded.distance_meters,duration_seconds=excluded.duration_seconds,created_at=now(),expires_at=excluded.expires_at`,[hash,metrics.provider,metrics.distanceMeters,metrics.durationSeconds,cacheMinutes()]).catch(()=>null);}

export async function routeMetrics(origin:Point,destination:Point,context?:RouteContext):Promise<RouteMetrics>{
 const hash=routeHash(origin,destination);const hit=await cached(hash,context);if(hit)return hit;
 const key=process.env.GOOGLE_MAPS_ROUTES_API_KEY;
 if(!key){const metrics=estimate(origin,destination);await recordUsage(context,'estimate',{request:true,fallback:true});await cache(hash,metrics);return metrics;}
 await recordUsage(context,'google_routes',{request:true,costMicrousd:googleCostMicrousd()});
 try{
  const response=await fetch('https://routes.googleapis.com/directions/v2:computeRoutes',{method:'POST',headers:{'content-type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'routes.distanceMeters,routes.duration'},body:JSON.stringify({origin:{location:{latLng:{latitude:origin.lat,longitude:origin.lng}}},destination:{location:{latLng:{latitude:destination.lat,longitude:destination.lng}}},travelMode:'DRIVE',routingPreference:'TRAFFIC_AWARE'}),cache:'no-store'});
  const body:any=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body?.error?.message||`Google Routes failed (${response.status})`);
  const route=body?.routes?.[0];if(!route?.distanceMeters||!route?.duration)throw new Error('Google Routes returned no usable route');
  const seconds=Math.round(Number(String(route.duration).replace('s','')));const metrics:RouteMetrics={distanceMeters:Number(route.distanceMeters),durationSeconds:seconds,provider:'google_routes'};await cache(hash,metrics);return metrics;
 }catch{
  const metrics=estimate(origin,destination);await recordUsage(context,'estimate',{request:true,fallback:true});await cache(hash,metrics);return metrics;
 }
}
