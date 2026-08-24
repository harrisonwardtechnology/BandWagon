"use client";

import { useEffect, useState } from "react";

type Row = Record<string, any>;

export default function AdminRidesPage() {
  const [organizations,setOrganizations] = useState<Row[]>([]);
  const [organizationId,setOrganizationId] = useState("");
  const [people,setPeople] = useState<Row[]>([]);
  const [events,setEvents] = useState<Row[]>([]);
  const [requests,setRequests] = useState<Row[]>([]);
  const [rides,setRides] = useState<Row[]>([]);
  const [message,setMessage] = useState("");
  const [requester,setRequester] = useState("");
  const [passenger,setPassenger] = useState("");
  const [eventId,setEventId] = useState("");
  const [driver,setDriver] = useState("");
  const [selectedRequest,setSelectedRequest] = useState("");
  const [selectedOffer,setSelectedOffer] = useState("");
  const [actor,setActor] = useState("");
  const [selectedRide,setSelectedRide] = useState("");
  const [toStatus,setToStatus] = useState("driver_en_route");

  const headers = { "content-type":"application/json" };

  async function load(org = organizationId) {
    setMessage("");
    const qs = org ? `?organizationId=${encodeURIComponent(org)}` : "";
    const r = await fetch(`/api/admin/rides${qs}`);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setMessage(d.error || "Unable to load ride data");
    setOrganizations(d.organizations || []);
    if (org) {
      setPeople(d.people || []); setEvents(d.events || []); setRequests(d.requests || []); setRides(d.rides || []);
    }
  }

  async function act(body: Row) {
    setMessage("Working...");
    const r = await fetch("/api/admin/rides", { method:"POST", headers, body:JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setMessage(d.error || "Ride action failed");
    setMessage("Done.");
    await load();
    return d.result;
  }

  useEffect(() => { if (organizationId) void load(organizationId); }, [organizationId]);

  const card = { border:"1px solid #dbe3ef", borderRadius:16, padding:20, marginTop:20 } as const;
  const input = { width:"100%", padding:10, border:"1px solid #cbd5e1", borderRadius:8, margin:"6px 0 12px" } as const;
  const button = { padding:"10px 14px", borderRadius:9, border:"1px solid #cbd5e1", cursor:"pointer", marginRight:8 } as const;

  return <main style={{ maxWidth:1100, margin:"40px auto", padding:"0 20px", fontFamily:"system-ui,sans-serif" }}>
    <section style={{ background:"#101b33", color:"white", padding:28, borderRadius:22 }}>
      <div style={{ fontSize:13,fontWeight:800,letterSpacing:1 }}>PLATFORM ADMIN</div>
      <h1 style={{ fontSize:40,margin:"6px 0" }}>Ride Workflow</h1>
      <p style={{ margin:0,opacity:.9 }}>Development console for request → offer → match → pickup → completion.</p>
    </section>

    <section style={card}>
      <p><b>Platform owner access required.</b> This development console uses your signed-in session.</p>
      <button style={button} onClick={()=>load("")}>Load Organizations</button>
      <label style={{display:"block",marginTop:14}}>Organization</label>
      <select value={organizationId} onChange={e=>setOrganizationId(e.target.value)} style={input}>
        <option value="">Select...</option>{organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </section>

    {organizationId && <>
      <section style={card}>
        <h2>Create Ride Request</h2>
        <label>Requester</label><select value={requester} onChange={e=>setRequester(e.target.value)} style={input}><option value="">Select...</option>{people.map(p=><option key={p.id} value={p.id}>{p.display_name} ({p.person_type})</option>)}</select>
        <label>Passenger</label><select value={passenger} onChange={e=>setPassenger(e.target.value)} style={input}><option value="">Select...</option>{people.map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select>
        <label>Event</label><select value={eventId} onChange={e=>setEventId(e.target.value)} style={input}><option value="">No event / other</option>{events.map(e=><option key={e.id} value={e.id}>{e.title}</option>)}</select>
        <button style={button} onClick={()=>act({action:"create_request",organizationId,requesterPersonId:requester,passengerPersonId:passenger,eventId:eventId||null,direction:"to_event",seatsNeeded:1})}>Create Request</button>
      </section>

      <section style={card}>
        <h2>Open Requests</h2>
        {requests.length===0 ? <p>No ride requests yet.</p> : requests.map(r=><div key={r.id} style={{padding:"12px 0",borderBottom:"1px solid #e5e7eb"}}>
          <b>{r.passenger_name}</b> · {r.event_title || "Other ride"} · <code>{r.status}</code> · {r.open_offers} offer(s)<br/>
          <small>{r.public_ref}</small>
        </div>)}
      </section>

      <section style={card}>
        <h2>Create Driver Offer</h2>
        <label>Ride Request</label><select value={selectedRequest} onChange={e=>setSelectedRequest(e.target.value)} style={input}><option value="">Select...</option>{requests.filter(r=>r.status==='open').map(r=><option key={r.id} value={r.id}>{r.passenger_name} · {r.event_title || r.public_ref}</option>)}</select>
        <label>Driver</label><select value={driver} onChange={e=>setDriver(e.target.value)} style={input}><option value="">Select...</option>{people.filter(p=>p.person_type==='adult').map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select>
        <button style={button} onClick={async()=>{ const o=await act({action:"create_offer",rideRequestId:selectedRequest,driverPersonId:driver,seatsOffered:4}); if(o?.id) setSelectedOffer(o.id); }}>Create Offer</button>
        {selectedOffer && <p>Latest offer ID: <code>{selectedOffer}</code></p>}
      </section>

      <section style={card}>
        <h2>Accept Offer</h2>
        <label>Ride Request ID</label><input value={selectedRequest} onChange={e=>setSelectedRequest(e.target.value)} style={input}/>
        <label>Offer ID</label><input value={selectedOffer} onChange={e=>setSelectedOffer(e.target.value)} style={input}/>
        <label>Actor (requester/guardian)</label><select value={actor} onChange={e=>setActor(e.target.value)} style={input}><option value="">Select...</option>{people.map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select>
        <button style={button} onClick={()=>act({action:"accept_offer",rideRequestId:selectedRequest,offerId:selectedOffer,actorPersonId:actor})}>Accept + Match</button>
      </section>

      <section style={card}>
        <h2>Active Rides</h2>
        {rides.length===0 ? <p>No matched rides yet.</p> : rides.map(r=><div key={r.id} style={{padding:"12px 0",borderBottom:"1px solid #e5e7eb"}}>
          <b>{r.passenger_name}</b> with {r.driver_name} · {r.event_title || "Ride"} · <code>{r.status}</code><br/><small>{r.public_ref}</small>
        </div>)}
        <hr style={{margin:"20px 0"}}/>
        <label>Ride</label><select value={selectedRide} onChange={e=>setSelectedRide(e.target.value)} style={input}><option value="">Select...</option>{rides.filter(r=>!['completed','cancelled','no_show'].includes(r.status)).map(r=><option key={r.id} value={r.id}>{r.passenger_name} · {r.status}</option>)}</select>
        <label>Actor</label><select value={actor} onChange={e=>setActor(e.target.value)} style={input}><option value="">Select...</option>{people.map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select>
        <label>Next Status</label><select value={toStatus} onChange={e=>setToStatus(e.target.value)} style={input}>{['driver_en_route','arrived','picked_up','completed','cancelled','no_show'].map(s=><option key={s}>{s}</option>)}</select>
        <button style={button} onClick={()=>act({action:"transition_ride",rideId:selectedRide,actorPersonId:actor,toStatus})}>Transition Ride</button>
      </section>
    </>}

    {message && <p style={{marginTop:20,padding:14,background:"#f8fafc",borderRadius:10}}>{message}</p>}
  </main>;
}
