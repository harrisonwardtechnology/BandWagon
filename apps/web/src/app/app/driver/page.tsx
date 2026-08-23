"use client";

import { useEffect,useMemo,useState } from "react";
import { AppNav,appCardStyle,appPageStyle } from "@/components/app-nav";

type Row=Record<string,any>;

export default function DriverPage(){
  const [d,setD]=useState<Row|null>(null);const [message,setMessage]=useState("");const [working,setWorking]=useState(false);
  const [org,setOrg]=useState("");const [capacity,setCapacity]=useState("4");const [vehicle,setVehicle]=useState("");const [color,setColor]=useState("");
  function applyProfile(dashboard:Row,organizationId:string){
    const profile=(dashboard.driverProfiles||[]).find((p:Row)=>p.organization_id===organizationId);
    setCapacity(String(profile?.default_capacity||4));
    setVehicle(profile?.vehicle_label||dashboard.driverProfiles?.[0]?.vehicle_label||"");
    setColor(profile?.vehicle_color||dashboard.driverProfiles?.[0]?.vehicle_color||"");
  }
  async function load(){
    const r=await fetch("/api/product");const x=await r.json().catch(()=>({}));
    if(r.status===401){location.href="/login";return;}if(!r.ok){setMessage(x.error||"Unable to load driver tools");return;}
    setD(x.dashboard);const selected=org||x.dashboard.organizations[0]?.id||"";if(selected){setOrg(selected);applyProfile(x.dashboard,selected);}
  }
  async function configure(enabled=true){
    setWorking(true);const r=await fetch("/api/onboarding",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"configure_driver",organizationId:org,enabled,capacity:Number(capacity||4),vehicleLabel:vehicle||null,vehicleColor:color||null,willingByDefault:enabled})});
    const x=await r.json().catch(()=>({}));setWorking(false);if(!r.ok){setMessage(x.error||"Unable to update driver profile");return;}
    setMessage(enabled?"Driver profile updated for this organization.":"Driving paused for this organization.");await load();
  }
  async function offer(requestId:string,seats:number){
    setWorking(true);const r=await fetch("/api/product",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"offer_ride",rideRequestId:requestId,seatsOffered:Math.max(seats,Number(capacity||4))})});
    const x=await r.json().catch(()=>({}));setWorking(false);if(!r.ok){setMessage(x.error||"Unable to offer ride");return;}setD(x.dashboard);setMessage("Ride offered. The requester can now accept it.");
  }
  useEffect(()=>{void load();},[]);
  const currentProfile=useMemo(()=>d?.driverProfiles?.find((p:Row)=>p.organization_id===org)||null,[d,org]);
  const openRequests=useMemo(()=>d?.openRequests?.filter((r:Row)=>r.organization_id===org)||[],[d,org]);
  const input={width:"100%",padding:10,border:"1px solid #cbd5e1",borderRadius:9,margin:"6px 0 12px",boxSizing:"border-box" as const};const button={padding:"10px 14px",border:0,borderRadius:9,background:"#101b33",color:"white",fontWeight:800,cursor:"pointer"} as const;
  const driverUnavailable=!currentProfile||currentProfile.status!=="active";
  return <main style={appPageStyle}><AppNav active="Driver"/>{!d?<div style={appCardStyle}>Loading driver tools…</div>:<>
    <section style={{...appCardStyle,marginBottom:18}}><h1 style={{marginTop:0}}>Driver profile</h1><p style={{color:"#64748b"}}>Driving is enabled separately for each organization. Joining one group never opts you in to drive for another.</p>{!d.organizations.length?<p>Join an organization before enabling driving.</p>:<><label>Organization</label><select value={org} onChange={e=>{setOrg(e.target.value);applyProfile(d,e.target.value);}} style={input}>{d.organizations.map((o:Row)=><option key={o.id} value={o.id}>{o.name}</option>)}</select><label>Available seats</label><input inputMode="numeric" value={capacity} onChange={e=>setCapacity(e.target.value.replace(/\D/g,""))} style={input}/><label>Vehicle label <span style={{color:"#64748b"}}>(optional)</span></label><input value={vehicle} onChange={e=>setVehicle(e.target.value)} placeholder="Blue Tahoe" style={input}/><label>Vehicle color <span style={{color:"#64748b"}}>(optional)</span></label><input value={color} onChange={e=>setColor(e.target.value)} style={input}/><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button disabled={working||!org} style={{...button,opacity:working ? .6 : 1}} onClick={()=>configure(true)}>I am willing to drive here</button>{currentProfile&&<button disabled={working} style={{padding:"10px 14px",border:"1px solid #cbd5e1",borderRadius:9,background:"white",cursor:"pointer"}} onClick={()=>configure(false)}>Pause driving here</button>}</div></>}</section>
    <section style={appCardStyle}><h2 style={{marginTop:0}}>Rides needing help</h2>{!openRequests.length?<p>No open requests for this organization right now.</p>:openRequests.map((r:Row)=><div key={r.id} style={{padding:"14px 0",borderBottom:"1px solid #e2e8f0",display:"flex",justifyContent:"space-between",gap:14,alignItems:"center",flexWrap:"wrap"}}><div><b>{r.event_title||"Ride request"}</b><div style={{fontSize:13,color:"#64748b",marginTop:3}}>{r.direction.replaceAll("_"," ")} · {r.pickup_area||"Pickup area shared after setup"} · {r.seats_needed} seat(s)</div></div><button disabled={working||driverUnavailable} style={{...button,opacity:driverUnavailable ? .45 : 1}} onClick={()=>offer(r.id,r.seats_needed)}>Offer ride</button></div>)}</section>
  </>}{message&&<div style={{position:"fixed",bottom:20,right:20,maxWidth:380,padding:14,background:"#101b33",color:"white",borderRadius:12}}>{message}</div>}</main>;
}
