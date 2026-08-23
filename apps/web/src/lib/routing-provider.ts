type Point={lat:number;lng:number};
export type RouteMetrics={distanceMeters:number;durationSeconds:number;provider:'google_routes'|'estimate'};

function haversineKm(a:Point,b:Point){const r=(v:number)=>v*Math.PI/180,dLat=r(b.lat-a.lat),dLng=r(b.lng-a.lng);const x=Math.sin(dLat/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLng/2)**2;return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
function estimate(a:Point,b:Point):RouteMetrics{const roadKm=haversineKm(a,b)*1.35;return{distanceMeters:Math.round(roadKm*1000),durationSeconds:Math.max(60,Math.round((roadKm/35)*3600)),provider:'estimate'};}

export async function routeMetrics(origin:Point,destination:Point):Promise<RouteMetrics>{
 const key=process.env.GOOGLE_MAPS_ROUTES_API_KEY;
 if(!key)return estimate(origin,destination);
 try{
  const response=await fetch('https://routes.googleapis.com/directions/v2:computeRoutes',{method:'POST',headers:{'content-type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'routes.distanceMeters,routes.duration'},body:JSON.stringify({origin:{location:{latLng:{latitude:origin.lat,longitude:origin.lng}}},destination:{location:{latLng:{latitude:destination.lat,longitude:destination.lng}}},travelMode:'DRIVE',routingPreference:'TRAFFIC_AWARE'})});
  const body:any=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body?.error?.message||`Google Routes failed (${response.status})`);
  const route=body?.routes?.[0];if(!route?.distanceMeters||!route?.duration)throw new Error('Google Routes returned no usable route');
  const seconds=Math.round(Number(String(route.duration).replace('s','')));return{distanceMeters:Number(route.distanceMeters),durationSeconds:seconds,provider:'google_routes'};
 }catch{return estimate(origin,destination);}
}
