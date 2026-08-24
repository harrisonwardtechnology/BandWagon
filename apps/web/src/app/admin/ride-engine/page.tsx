"use client";

import { useEffect,useState } from "react";

type Row = Record<string,any>;

export default function RideEngineAdminPage() {
  const [organizations,setOrganizations] = useState<Row[]>([]);
  const [organizationId,setOrganizationId] = useState("");
  const [people,setPeople] = useState<Row[]>([]);
  const [drivers,setDrivers] = useState<Row[]>([]);
  const [requests,setRequests] = useState<Row[]>([]);
  const [rides,setRides] = useState<Row[]>([]);
  const [suggestions,setSuggestions] = useState<Row[]>([]);
  const [message,setMessage] = useState("");

  const [driverPersonId,setDriverPersonId] = useState("");
  const [capacity,setCapacity] = useState(4);
  const [vehicleLabel,setVehicleLabel] = useState("");
  const [willing,setWilling] = useState(true);
  const [zoneLabel,setZoneLabel] = useState("Home area");
  const [zoneLat,setZoneLat] = useState("");
  const [zoneLng,setZoneLng] = useState("");
  const [zoneRadius,setZoneRadius] = useState(8);
  const [weekday,setWeekday] = useState(1);
  const [startTime,setStartTime] = useState("06:00");
  const [endTime,setEndTime] = useState("22:00");

  const [rideRequestId,setRideRequestId] = useState("");
  const [rideId,setRideId] = useState("");
  const [actorPersonId,setActorPersonId] = useState("");

  const headers = {"content-type":"application/json"};
  const card = { border:"1px solid #dbe3ef",borderRadius:16,padding:20,marginTop:20 } as const;
  const input = { width:"100%",padding:10,border:"1px solid #cbd5e1",borderRadius:8,margin:"6px 0 12px" } as const;
  const button = { padding:"10px 14px",borderRadius:9,border:"1px solid #cbd5e1",cursor:"pointer",marginRight:8,marginBottom:8 } as const;

  async function load(org=organizationId) {
    setMessage("");
    const qs = org ? `?organizationId=${encodeURIComponent(org)}` : "";
    const r = await fetch(`/api/admin/ride-engine${qs}`);
    const d = await r.json().catch(()=>({}));
    if (!r.ok) return setMessage(d.error || "Unable to load ride engine");
    setOrganizations(d.organizations || []);
    if (org) {
      setPeople(d.people || []); setDrivers(d.drivers || []); setRequests(d.requests || []); setRides(d.rides || []); setSuggestions(d.suggestions || []);
    }
  }

  async function act(body: Row) {
    setMessage("Working...");
    const r = await fetch("/api/admin/ride-engine",{method:"POST",headers,body:JSON.stringify(body)});
    const d = await r.json().catch(()=>({}));
    if (!r.ok) { setMessage(d.error || "Ride engine action failed"); return null; }
    setMessage("Done.");
    await load();
    return d.result;
  }

  useEffect(()=>{ if(organizationId) void load(organizationId); },[organizationId]);

  return <main style={{maxWidth:1180,margin:"40px auto",padding:"0 20px",fontFamily:"system-ui,sans-serif"}}>
    <section style={{background:"#101b33",color:"white",padding:28,borderRadius:22}}>
      <div style={{fontSize:13,fontWeight:800,letterSpacing:1}}>BANDWAGON 0.11</div>
      <h1 style={{fontSize:40,margin:"6px 0"}}>Ride Engine</h1>
      <p style={{margin:0,opacity:.9}}>Driver preferences, multi-passenger carpools, seat accounting and smart match suggestions.</p>
    </section>

    <section style={card}>
      <p><b>Platform owner access required.</b> This development console uses your signed-in session.</p>
      <button style={button} onClick={()=>load("")}>Load Organizations</button>
      <label style={{display:"block",marginTop:12}}>Organization</label>
      <select value={organizationId} onChange={e=>setOrganizationId(e.target.value)} style={input}>
        <option value="">Select...</option>{organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </section>

    {organizationId && <>
      <section style={card}>
        <h2>011 · Driver Experience</h2>
        <label>Driver</label>
        <select value={driverPersonId} onChange={e=>setDriverPersonId(e.target.value)} style={input}>
          <option value="">Select...</option>{people.map(p=><option key={p.id} value={p.id}>{p.display_name} ({p.person_type})</option>)}
        </select>
        <label>Vehicle label</label><input value={vehicleLabel} onChange={e=>setVehicleLabel(e.target.value)} placeholder="Blue SUV" style={input}/>
        <label>Seat capacity</label><input type="number" min={1} max={12} value={capacity} onChange={e=>setCapacity(Number(e.target.value))} style={input}/>
        <label style={{display:"block",marginBottom:12}}><input type="checkbox" checked={willing} onChange={e=>setWilling(e.target.checked)}/> Always willing when no schedule rule exists</label>
        <button style={button} onClick={()=>act({action:"upsert_driver",organizationId,personId:driverPersonId,defaultCapacity:capacity,vehicleLabel,willingByDefault:willing,allowMultiPassenger:true,maxDetourMinutes:15,maxPickupRadiusKm:zoneRadius})}>Save Driver Profile</button>

        <h3>Preferred service area</h3>
        <label>Label</label><input value={zoneLabel} onChange={e=>setZoneLabel(e.target.value)} style={input}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
          <div><label>Generalized latitude</label><input value={zoneLat} onChange={e=>setZoneLat(e.target.value)} style={input}/></div>
          <div><label>Generalized longitude</label><input value={zoneLng} onChange={e=>setZoneLng(e.target.value)} style={input}/></div>
          <div><label>Radius km</label><input type="number" value={zoneRadius} onChange={e=>setZoneRadius(Number(e.target.value))} style={input}/></div>
        </div>
        <button style={button} onClick={()=>act({action:"add_zone",organizationId,driverPersonId,label:zoneLabel,latitude:Number(zoneLat),longitude:Number(zoneLng),radiusKm:zoneRadius})}>Add Service Zone</button>

        <h3>Recurring availability</h3>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
          <div><label>Weekday</label><select value={weekday} onChange={e=>setWeekday(Number(e.target.value))} style={input}>{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d,i)=><option key={d} value={i}>{d}</option>)}</select></div>
          <div><label>Start</label><input type="time" value={startTime} onChange={e=>setStartTime(e.target.value)} style={input}/></div>
          <div><label>End</label><input type="time" value={endTime} onChange={e=>setEndTime(e.target.value)} style={input}/></div>
        </div>
        <button style={button} onClick={()=>act({action:"add_availability",organizationId,driverPersonId,weekday,startTime,endTime,timeZone:"America/Chicago",direction:"any"})}>Add Availability</button>

        <div style={{marginTop:18}}>{drivers.map(d=><div key={d.person_id} style={{padding:"12px 0",borderTop:"1px solid #e5e7eb"}}>
          <b>{d.display_name}</b> · {d.default_capacity} seats · <code>{d.status}</code> · {d.willing_by_default ? "always willing" : "scheduled"}<br/>
          <small>{(d.zones || []).length} zone(s) · {(d.recurring_availability || []).length} recurring window(s) · {d.vehicle_label || "vehicle not labeled"}</small>
        </div>)}</div>
      </section>

      <section style={card}>
        <h2>013 · Smart Matching</h2>
        <label>Open ride request</label>
        <select value={rideRequestId} onChange={e=>setRideRequestId(e.target.value)} style={input}>
          <option value="">Select...</option>{requests.filter(r=>r.status==='open').map(r=><option key={r.id} value={r.id}>{r.passenger_name} · {r.event_title || r.public_ref}</option>)}
        </select>
        <button style={button} onClick={()=>act({action:"generate_matches",rideRequestId,limit:10})}>Generate Matches</button>
        <button style={button} onClick={()=>act({action:"notify_matches",rideRequestId,limit:3})}>Notify Top 3 Drivers</button>
        <div style={{marginTop:12}}>{suggestions.filter(s=>!rideRequestId || s.ride_request_id===rideRequestId).map(s=><div key={s.id} style={{padding:"12px 0",borderTop:"1px solid #e5e7eb"}}>
          <b>{s.driver_name}</b> · score <b>{Number(s.score).toFixed(1)}</b> · <code>{s.candidate_type}</code>
          {s.distance_km != null ? ` · ${Number(s.distance_km).toFixed(1)} km` : ''}
          {s.time_gap_minutes != null ? ` · ${s.time_gap_minutes} min gap` : ''}
          {s.ride_ref ? ` · existing ride ${s.ride_ref}` : ''}
        </div>)}</div>
      </section>

      <section style={card}>
        <h2>012 · Multi-Passenger Carpool</h2>
        <p>Attach a compatible open request to an existing confirmed ride. Capacity, event, direction and pickup-time compatibility are checked transactionally.</p>
        <label>Existing ride</label>
        <select value={rideId} onChange={e=>setRideId(e.target.value)} style={input}>
          <option value="">Select...</option>{rides.map(r=><option key={r.id} value={r.id}>{r.driver_name} · {r.event_title || r.public_ref} · {r.remaining_seats} seat(s) open</option>)}
        </select>
        <label>Open ride request</label>
        <select value={rideRequestId} onChange={e=>setRideRequestId(e.target.value)} style={input}>
          <option value="">Select...</option>{requests.filter(r=>r.status==='open').map(r=><option key={r.id} value={r.id}>{r.passenger_name} · {r.event_title || r.public_ref}</option>)}
        </select>
        <label>Actor (driver, requester or guardian)</label>
        <select value={actorPersonId} onChange={e=>setActorPersonId(e.target.value)} style={input}>
          <option value="">Select...</option>{people.map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}
        </select>
        <button style={button} onClick={()=>act({action:"attach_request",rideId,rideRequestId,actorPersonId})}>Add Passenger to Carpool</button>

        <div style={{marginTop:18}}>{rides.map(r=><div key={r.id} style={{padding:"12px 0",borderTop:"1px solid #e5e7eb"}}>
          <b>{r.driver_name}</b> · {r.event_title || "Other ride"} · {r.seats_reserved}/{r.capacity_snapshot} seats · {r.request_count} request(s)
        </div>)}</div>
      </section>
    </>}

    {message && <p style={{marginTop:20,padding:14,background:"#f8fafc",borderRadius:10}}>{message}</p>}
  </main>;
}
