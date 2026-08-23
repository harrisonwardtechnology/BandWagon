"use client";

import { useEffect,useMemo,useState } from "react";
import { AppNav,appCardStyle,appPageStyle } from "@/components/app-nav";

type Row=Record<string,any>;

export default function RidesPage(){
  const [d,setD]=useState<Row|null>(null); const [message,setMessage]=useState(""); const [working,setWorking]=useState(false);
  const [org,setOrg]=useState(""); const [person,setPerson]=useState(""); const [eventId,setEventId]=useState(""); const [direction,setDirection]=useState("to_event");
  const [pickupAddress,setPickupAddress]=useState(""); const [dropoffAddress,setDropoffAddress]=useState("");
  async function load(){const r=await fetch("/api/product");const x=await r.json().catch(()=>({}));if(r.status===401){location.href="/login";return;}if(!r.ok){setMessage(x.error||"Unable to load rides");return;}setD(x.dashboard);if(!org&&x.dashboard.organizations[0])setOrg(x.dashboard.organizations[0].id);if(!person&&x.dashboard.people[0])setPerson(x.dashboard.people[0].id);}
  async function act(body:Row){setWorking(true);setMessage("");const r=await fetch("/api/product",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const x=await r.json().catch(()=>({}));setWorking(false);if(!r.ok){setMessage(x.error||"Ride action failed");return null;}if(x.dashboard)setD(x.dashboard);setMessage("Done.");return x.result;}
  async function viewLocation(locationId:string,rideId:string,label:string){const result=await act({action:"view_location",locationId,rideId});if(result?.address)setMessage(`${label}: ${result.address}`);else if(result)setMessage(`${label}: ${result.generalizedArea||"Exact address is not available to you yet."}`);}
  useEffect(()=>{void load();},[]);
  const orgEvents=useMemo(()=>d?.events?.filter((e:Row)=>!org||e.organization_id===org)||[],[d,org]);
  function eventChanged(value:string){setEventId(value);const event=orgEvents.find((e:Row)=>e.id===value);if(!event?.location_address)return;if(direction==='to_event')setDropoffAddress(event.location_address);if(direction==='from_event')setPickupAddress(event.location_address);}
  const input={width:"100%",padding:10,border:"1px solid #cbd5e1",borderRadius:9,margin:"6px 0 12px",boxSizing:"border-box" as const};
  const button={padding:"10px 14px",border:0,borderRadius:9,background:"#101b33",color:"white",fontWeight:800,cursor:"pointer"} as const;
  return <main style={appPageStyle}><AppNav active="Rides"/>{!d?<div style={appCardStyle}>Loading rides…</div>:<>
    <section style={{...appCardStyle,marginBottom:18}}><h1 style={{marginTop:0}}>Need a ride?</h1><p style={{color:"#64748b"}}>Exact addresses are encrypted. Before a match, other families only see the generalized area.</p>
      {!d.organizations.length?<p><b>Join an organization first</b> from the Household page.</p>:<>
        <label>Organization</label><select value={org} onChange={e=>{setOrg(e.target.value);setEventId("");}} style={input}>{d.organizations.map((o:Row)=><option key={o.id} value={o.id}>{o.name}</option>)}</select>
        <label>Rider</label><select value={person} onChange={e=>setPerson(e.target.value)} style={input}>{d.people.map((p:Row)=><option key={p.id} value={p.id}>{p.preferred_name||p.display_name}</option>)}</select>
        <label>Event</label><select value={eventId} onChange={e=>eventChanged(e.target.value)} style={input}><option value="">Other / no event</option>{orgEvents.map((e:Row)=><option key={e.id} value={e.id}>{e.title}{e.starts_at?` · ${new Date(e.starts_at).toLocaleString()}`:""}</option>)}</select>
        <label>Direction</label><select value={direction} onChange={e=>setDirection(e.target.value)} style={input}><option value="to_event">To event</option><option value="from_event">From event</option><option value="round_trip">Round trip</option><option value="other">Other</option></select>
        <label>Pickup address <span style={{color:"#64748b"}}>(optional)</span></label><input value={pickupAddress} onChange={e=>setPickupAddress(e.target.value)} placeholder="Exact address - encrypted" style={input}/>
        <label>Drop-off address <span style={{color:"#64748b"}}>(optional)</span></label><input value={dropoffAddress} onChange={e=>setDropoffAddress(e.target.value)} placeholder="Exact address - encrypted" style={input}/>
        <button disabled={working||!org||!person} style={{...button,opacity:working ? .6 : 1}} onClick={async()=>{const result=await act({action:"create_request",organizationId:org,passengerPersonId:person,eventId:eventId||null,direction,seatsNeeded:1,pickupAddress:pickupAddress||null,dropoffAddress:dropoffAddress||null});if(result){setPickupAddress("");setDropoffAddress("");}}}>Request ride</button>
      </>}
    </section>

    <section style={{...appCardStyle,marginBottom:18}}><h2 style={{marginTop:0}}>Your ride requests</h2>{!d.requests.length?<p>No ride requests yet.</p>:d.requests.map((r:Row)=><div key={r.id} style={{padding:"14px 0",borderBottom:"1px solid #e2e8f0"}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><div><b>{r.passenger_name}</b> · {r.event_title||"Other ride"}<div style={{fontSize:13,color:"#64748b",marginTop:3}}>{r.direction.replaceAll("_"," ")} · {r.status.replaceAll("_"," ")}{r.pickup_area?` · pickup near ${r.pickup_area}`:""}</div></div><code>{r.public_ref}</code></div>
      {Array.isArray(r.offers)&&r.offers.filter((o:Row)=>o.status==='offered').length>0&&<div style={{marginTop:12,padding:12,background:"#f8fafc",borderRadius:12}}><b>Driver offers</b>{r.offers.filter((o:Row)=>o.status==='offered').map((o:Row)=><div key={o.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,marginTop:9}}><span>{o.driverName} · {o.seatsOffered} seat(s)</span><button style={button} disabled={working} onClick={()=>act({action:"accept_offer",rideRequestId:r.id,offerId:o.id})}>Accept</button></div>)}</div>}
      {r.status==='open'&&<button style={{marginTop:10,padding:"7px 10px",border:"1px solid #cbd5e1",borderRadius:8,background:"white",cursor:"pointer"}} onClick={()=>act({action:"refresh_matches",rideRequestId:r.id})}>Refresh suggested matches</button>}
    </div>)}</section>

    <section style={appCardStyle}><h2 style={{marginTop:0}}>Confirmed rides</h2>{!d.rides.length?<p>No confirmed rides yet.</p>:d.rides.map((r:Row)=><div key={r.id} style={{padding:"14px 0",borderBottom:"1px solid #e2e8f0"}}><b>{r.event_title||"Ride"}</b> · with {r.driver_name}<div style={{fontSize:13,color:"#64748b",marginTop:3}}>{r.status.replaceAll("_"," ")}{r.scheduled_pickup_at?` · ${new Date(r.scheduled_pickup_at).toLocaleString()}`:""}</div><div style={{marginTop:9,display:"flex",gap:7,flexWrap:"wrap"}}>{r.viewer_pickup_location_id&&<button style={{padding:"7px 10px",border:"1px solid #cbd5e1",borderRadius:8,background:"white",cursor:"pointer"}} onClick={()=>viewLocation(r.viewer_pickup_location_id,r.id,"Pickup")}>View pickup</button>}{r.viewer_dropoff_location_id&&<button style={{padding:"7px 10px",border:"1px solid #cbd5e1",borderRadius:8,background:"white",cursor:"pointer"}} onClick={()=>viewLocation(r.viewer_dropoff_location_id,r.id,"Drop-off")}>View drop-off</button>}</div>{r.driver_person_id===d.identity.personId&&!['completed','cancelled','no_show'].includes(r.status)&&<div style={{marginTop:9,display:"flex",gap:7,flexWrap:"wrap"}}>{(['driver_en_route','arrived','picked_up','completed'] as string[]).map(s=><button key={s} style={{padding:"7px 10px",border:"1px solid #cbd5e1",borderRadius:8,background:"white",cursor:"pointer"}} onClick={()=>act({action:"transition_ride",rideId:r.id,toStatus:s})}>{s.replaceAll("_"," ")}</button>)}</div>}</div>)}</section>
  </>}{message&&<div style={{position:"fixed",bottom:20,right:20,maxWidth:500,padding:14,background:"#101b33",color:"white",borderRadius:12}}>{message}</div>}</main>;
}
