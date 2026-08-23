"use client";

import { useEffect,useMemo,useState } from "react";
import { AppNav,appCardStyle,appPageStyle } from "@/components/app-nav";

type Row=Record<string,any>;
function miles(meters:any){return Math.round((Number(meters||0)/1609.344)*10)/10;}
function matchReason(row:Row){
  const reasons=Array.isArray(row.reason_codes)?row.reason_codes:[];
  const parts:string[]=[];
  if(reasons.includes("same_event_or_route"))parts.push("Same event / direction");
  if(reasons.includes("capacity_available"))parts.push("Enough seats");
  if(reasons.includes("within_time_limit"))parts.push("Inside your time limit");
  if(reasons.includes("within_deviation_limit"))parts.push("Inside your route limit");
  if(reasons.includes("google_routes"))parts.push("Google road routing");
  else parts.push("Estimated routing");
  return parts.join(" · ");
}

export default function DriverPage(){
  const[d,setD]=useState<Row|null>(null),[message,setMessage]=useState(""),[working,setWorking]=useState(false),[recommended,setRecommended]=useState<Row[]>([]);
  const[org,setOrg]=useState(""),[capacity,setCapacity]=useState("4"),[vehicle,setVehicle]=useState(""),[color,setColor]=useState("");
  const[assist,setAssist]=useState(false),[assistMinutes,setAssistMinutes]=useState("10"),[assistPercent,setAssistPercent]=useState("10"),[assistNotify,setAssistNotify]=useState(true);

  function applyProfile(dashboard:Row,organizationId:string){
    const p=(dashboard.driverProfiles||[]).find((x:Row)=>x.organization_id===organizationId);
    setCapacity(String(p?.default_capacity||4));setVehicle(p?.vehicle_label||dashboard.driverProfiles?.[0]?.vehicle_label||"");setColor(p?.vehicle_color||dashboard.driverProfiles?.[0]?.vehicle_color||"");
    setAssist(Boolean(p?.route_assist_enabled));setAssistMinutes(String(p?.max_route_extra_minutes??10));setAssistPercent(String(p?.max_route_deviation_percent??10));setAssistNotify(p?.route_assist_notify!==false);
  }

  async function load(){
    const r=await fetch("/api/product"),x=await r.json().catch(()=>({}));
    if(r.status===401){location.href="/login";return;}if(!r.ok){setMessage(x.error||"Unable to load driver tools");return;}
    setD(x.dashboard);const selected=org||x.dashboard.organizations[0]?.id||"";if(selected){setOrg(selected);applyProfile(x.dashboard,selected);}
  }

  async function configure(enabled=true){
    setWorking(true);const r=await fetch("/api/onboarding",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"configure_driver",organizationId:org,enabled,capacity:Number(capacity||4),vehicleLabel:vehicle||null,vehicleColor:color||null,willingByDefault:enabled})}),x=await r.json().catch(()=>({}));setWorking(false);
    if(!r.ok){setMessage(x.error||"Unable to update driver profile");return;}setMessage(enabled?"Driver profile updated for this organization.":"Driving paused for this organization.");setRecommended([]);await load();
  }

  async function refreshAssist(notify=false){
    if(!org)return;setWorking(true);setMessage("");
    const r=await fetch("/api/product",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"refresh_route_assist",organizationId:org,notify})}),x=await r.json().catch(()=>({}));setWorking(false);
    if(!r.ok){setMessage(x.error||"Unable to refresh RouteAssist");return;}
    const rows=Array.isArray(x.result)?x.result:[];setRecommended(rows);if(x.dashboard)setD(x.dashboard);
    setMessage(rows.length?`Found ${rows.length} RouteAssist match${rows.length===1?"":"es"}.`:"No rides currently fit your RouteAssist limits.");
  }

  async function saveAssist(){
    setWorking(true);const r=await fetch("/api/onboarding",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"configure_route_assist",organizationId:org,enabled:assist,maxExtraMinutes:Number(assistMinutes||10),maxDeviationPercent:Number(assistPercent||10),notify:assistNotify})}),x=await r.json().catch(()=>({}));setWorking(false);
    if(!r.ok){setMessage(x.error||"Unable to update RouteAssist");return;}
    setMessage(assist?"RouteAssist enabled for this organization.":"RouteAssist disabled for this organization.");if(!assist)setRecommended([]);await load();if(assist)await refreshAssist(false);
  }

  async function offer(requestId:string,seats:number,recommendationId?:string){
    setWorking(true);const r=await fetch("/api/product",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"offer_ride",rideRequestId:requestId,seatsOffered:Math.max(seats,Number(capacity||4)),routeAssistRecommendationId:recommendationId||null,organizationId:org})}),x=await r.json().catch(()=>({}));setWorking(false);
    if(!r.ok){setMessage(x.error||"Unable to offer ride");return;}setD(x.dashboard);if(recommendationId)setRecommended(rows=>rows.filter(row=>row.id!==recommendationId));setMessage("Ride offered. The requester can now accept it.");
  }

  async function dismiss(recommendationId:string){
    setWorking(true);const r=await fetch("/api/product",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"dismiss_route_assist",organizationId:org,recommendationId})}),x=await r.json().catch(()=>({}));setWorking(false);
    if(!r.ok){setMessage(x.error||"Unable to dismiss recommendation");return;}setRecommended(rows=>rows.filter(row=>row.id!==recommendationId));setMessage("RouteAssist recommendation dismissed.");
  }

  useEffect(()=>{void load();},[]);
  const currentProfile=useMemo(()=>d?.driverProfiles?.find((p:Row)=>p.organization_id===org)||null,[d,org]);
  const openRequests=useMemo(()=>d?.openRequests?.filter((r:Row)=>r.organization_id===org)||[],[d,org]);
  const input={width:"100%",padding:10,border:"1px solid #cbd5e1",borderRadius:9,margin:"6px 0 12px",boxSizing:"border-box" as const};
  const button={padding:"10px 14px",border:0,borderRadius:9,background:"#101b33",color:"white",fontWeight:800,cursor:"pointer"} as const;
  const secondary={padding:"10px 14px",border:"1px solid #cbd5e1",borderRadius:9,background:"white",cursor:"pointer",fontWeight:700} as const;
  const driverUnavailable=!currentProfile||currentProfile.status!=="active";

  return <main style={appPageStyle}><AppNav active="Driver"/>{!d?<div style={appCardStyle}>Loading driver tools…</div>:<>
    <section style={{...appCardStyle,marginBottom:18}}><h1 style={{marginTop:0}}>Driver Profile</h1><p style={{color:"#64748b"}}>Driving is enabled separately for each organization. Joining one group never opts you in to drive for another.</p>{!d.organizations.length?<p>Join an organization before enabling driving.</p>:<><label>Organization</label><select value={org} onChange={e=>{setOrg(e.target.value);setRecommended([]);applyProfile(d,e.target.value);}} style={input}>{d.organizations.map((o:Row)=><option key={o.id} value={o.id}>{o.name}</option>)}</select><label>Available Seats</label><input inputMode="numeric" value={capacity} onChange={e=>setCapacity(e.target.value.replace(/\D/g,""))} style={input}/><label>Vehicle Label <span style={{color:"#64748b"}}>(optional)</span></label><input value={vehicle} onChange={e=>setVehicle(e.target.value)} placeholder="Blue Tahoe" style={input}/><label>Vehicle Color <span style={{color:"#64748b"}}>(optional)</span></label><input value={color} onChange={e=>setColor(e.target.value)} style={input}/><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button disabled={working||!org} style={{...button,opacity:working ? .6 : 1}} onClick={()=>configure(true)}>I Am Willing To Drive Here</button>{currentProfile&&<button disabled={working} style={secondary} onClick={()=>configure(false)}>Pause Driving Here</button>}</div></>}</section>

    {currentProfile&&<section style={{...appCardStyle,marginBottom:18}}><h2 style={{marginTop:0}}>RouteAssist</h2><p style={{color:"#64748b"}}>Let BandWagon recommend open rides that are reasonably on your way. Your actual route and rider identity remain private until the normal matching process allows disclosure.</p><label style={{display:"flex",gap:8,alignItems:"center",marginBottom:12}}><input type="checkbox" checked={assist} onChange={e=>setAssist(e.target.checked)}/> Recommend rides along my route</label><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}><div><label>Maximum Added Time</label><select value={assistMinutes} onChange={e=>setAssistMinutes(e.target.value)} style={input}><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="15">15 minutes</option><option value="30">30 minutes</option></select></div><div><label>Maximum Route Deviation</label><select value={assistPercent} onChange={e=>setAssistPercent(e.target.value)} style={input}><option value="5">5%</option><option value="10">10%</option><option value="15">15%</option><option value="25">25%</option></select></div></div><p style={{fontSize:13,color:"#64748b"}}>BandWagon enforces both limits. Whichever limit is reached first wins.</p><label style={{display:"flex",gap:8,alignItems:"center",marginBottom:14}}><input type="checkbox" checked={assistNotify} onChange={e=>setAssistNotify(e.target.checked)}/> Notify me when a good RouteAssist match appears</label><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button disabled={working} style={button} onClick={saveAssist}>Save RouteAssist</button>{currentProfile.route_assist_enabled&&<button disabled={working} style={secondary} onClick={()=>refreshAssist(false)}>Find Matches Now</button>}</div></section>}

    {currentProfile?.route_assist_enabled&&<section style={{...appCardStyle,marginBottom:18}}><div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}><div><h2 style={{margin:"0 0 4px"}}>Recommended Rides</h2><div style={{fontSize:13,color:"#64748b"}}>RouteAssist only shows requests that fit your configured time and route limits.</div></div><button disabled={working} style={secondary} onClick={()=>refreshAssist(false)}>Refresh</button></div>{!recommended.length?<p style={{marginBottom:0}}>No current recommendations. Refresh to check open rides against trips you are already taking.</p>:recommended.map((r:Row)=><div key={r.id} style={{marginTop:14,padding:16,border:"1px solid #dbeafe",borderRadius:14,background:"#f8fbff"}}><div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><div><div style={{fontSize:12,fontWeight:900,letterSpacing:.6,color:"#2563eb"}}>ALMOST ON YOUR WAY</div><h3 style={{margin:"4px 0"}}>{r.event_title||"Open Ride Request"}</h3><div style={{color:"#475569"}}>A rider needs {r.seats_needed||1} seat{Number(r.seats_needed||1)===1?"":"s"} · {String(r.direction||"").replaceAll("_"," ")}</div></div><div style={{textAlign:"right"}}><div style={{fontSize:28,fontWeight:950}}>{Math.round(Number(r.score||0))}%</div><div style={{fontSize:12,color:"#64748b"}}>Fit</div></div></div><div style={{display:"flex",gap:8,flexWrap:"wrap",margin:"12px 0"}}><span style={{padding:"6px 9px",background:"white",border:"1px solid #dbeafe",borderRadius:999,fontWeight:800}}>+{r.estimated_extra_minutes} min</span><span style={{padding:"6px 9px",background:"white",border:"1px solid #dbeafe",borderRadius:999,fontWeight:800}}>+{r.estimated_deviation_percent}%</span><span style={{padding:"6px 9px",background:"white",border:"1px solid #dbeafe",borderRadius:999,fontWeight:800}}>{miles(r.estimated_detour_distance_meters)} mi</span></div><details style={{marginBottom:12}}><summary style={{cursor:"pointer",fontWeight:800}}>Why This Match?</summary><div style={{marginTop:7,fontSize:13,color:"#64748b"}}>{matchReason(r)}. BandWagon does not share your actual route with the rider.</div></details><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button disabled={working||driverUnavailable} style={button} onClick={()=>offer(r.ride_request_id,Number(r.seats_needed||1),r.id)}>Offer Ride</button><button disabled={working} style={secondary} onClick={()=>dismiss(r.id)}>Not This One</button></div></div>)}</section>}

    <section style={appCardStyle}><h2 style={{marginTop:0}}>Rides Needing Help</h2>{!openRequests.length?<p>No open requests for this organization right now.</p>:openRequests.map((r:Row)=><div key={r.id} style={{padding:"14px 0",borderBottom:"1px solid #e2e8f0",display:"flex",justifyContent:"space-between",gap:14,alignItems:"center",flexWrap:"wrap"}}><div><b>{r.event_title||"Ride request"}</b><div style={{fontSize:13,color:"#64748b",marginTop:3}}>{r.direction.replaceAll("_"," ")} · {r.pickup_area||"Pickup area shared after setup"} · {r.seats_needed} seat(s)</div></div><button disabled={working||driverUnavailable} style={{...button,opacity:driverUnavailable ? .45 : 1}} onClick={()=>offer(r.id,r.seats_needed)}>Offer Ride</button></div>)}</section>
  </>}{message&&<div style={{position:"fixed",bottom:20,right:20,maxWidth:420,padding:14,background:"#101b33",color:"white",borderRadius:12}}>{message}</div>}</main>;
}
