"use client";

import { useEffect, useState } from "react";

type Row = Record<string, any>;

export default function EventsAdminPage() {
  const [organizationId,setOrganizationId]=useState("");
  const [organizations,setOrganizations]=useState<Row[]>([]);
  const [events,setEvents]=useState<Row[]>([]);
  const [controls,setControls]=useState<Row|null>(null);
  const [message,setMessage]=useState("");
  const [title,setTitle]=useState("");
  const [description,setDescription]=useState("");
  const [locationName,setLocationName]=useState("");
  const [locationAddress,setLocationAddress]=useState("");
  const [startsAt,setStartsAt]=useState("");
  const [endsAt,setEndsAt]=useState("");
  const [allDay,setAllDay]=useState(false);
  const [visibility,setVisibility]=useState("organization");
  const [rideCoordinationEnabled,setRideCoordinationEnabled]=useState(true);
  const [working,setWorking]=useState(false);

  async function load(orgId=organizationId) {
    const suffix=orgId?`?organizationId=${encodeURIComponent(orgId)}`:"";
    const response=await fetch(`/api/admin/events${suffix}`,{cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){setMessage(data.error||"Unable to load events");return;}
    setOrganizations(data.organizations||[]);
    setEvents(data.events||[]);
    setControls(data.calendarControls||null);
    if(!orgId&&data.organizations?.[0]){
      setOrganizationId(data.organizations[0].id);
      void load(data.organizations[0].id);
    }
  }

  useEffect(()=>{void load("");},[]);

  async function runAction(action:string,extra:Row={}) {
    setWorking(true);
    const response=await fetch("/api/admin/events",{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({action,organizationId,title,...extra}),
    });
    const data=await response.json().catch(()=>({}));
    setWorking(false);
    setMessage(response.ok?action==="update-calendar-controls"?"Calendar controls saved.":action==="create-manual"?"Manual event created.":"Event operation completed.":data.error||"Action failed");
    if(response.ok)await load();
    return response.ok;
  }

  const input={width:"100%",padding:10,margin:"6px 0 12px",boxSizing:"border-box" as const};
  const card={marginTop:18,padding:20,border:"1px solid #dbe3ef",borderRadius:16,background:"white"} as const;
  const button={padding:"9px 12px",border:"1px solid #cbd5e1",borderRadius:8,background:"white",fontWeight:800,cursor:"pointer"} as const;
  const settings=controls?.settings;

  return <main style={{maxWidth:1040,margin:"36px auto",padding:"0 20px",fontFamily:"system-ui,sans-serif",background:"#f8fafc"}}>
    <header style={{background:"#101b33",color:"white",padding:28,borderRadius:22}}><div style={{fontSize:13,fontWeight:900,letterSpacing:1}}>ORGANIZATION ADMIN</div><h1 style={{margin:"6px 0"}}>Events &amp; Calendar Sync</h1><p style={{marginBottom:0,opacity:.9}}>Control provider imports, merge exact cross-provider duplicates, and review potential overlaps.</p></header>
    <section style={card}><label><strong>Organization</strong><select value={organizationId} onChange={e=>{setOrganizationId(e.target.value);void load(e.target.value);}} style={input}><option value="">Select organization</option>{organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button style={button} disabled={working||!organizationId} onClick={()=>void runAction("bind-google")}>Bind Active Google Connection</button><button style={button} disabled={working} onClick={()=>void runAction("normalize")}>Normalize Imported Events</button><a href="/admin/integrations/microsoft" style={{...button,textDecoration:"none",color:"#101b33"}}>Microsoft Calendar</a><a href="/admin/integrations/google" style={{...button,textDecoration:"none",color:"#101b33"}}>Google Calendar</a></div></section>
    {settings&&<section style={card}><h2 style={{marginTop:0}}>Organization Sync Controls</h2><label style={{display:"flex",gap:10,margin:"10px 0"}}><input type="checkbox" checked={settings.google_sync_enabled} onChange={e=>setControls({...controls!,settings:{...settings,google_sync_enabled:e.target.checked}})}/>Import selected Google calendars</label><label style={{display:"flex",gap:10,margin:"10px 0"}}><input type="checkbox" checked={settings.microsoft_sync_enabled} onChange={e=>setControls({...controls!,settings:{...settings,microsoft_sync_enabled:e.target.checked}})}/>Import selected Microsoft calendars</label><label><strong>Cross-provider duplicate handling</strong><select value={settings.conflict_mode} onChange={e=>setControls({...controls!,settings:{...settings,conflict_mode:e.target.value}})} style={input}><option value="merge_exact">Merge exact title/time duplicates</option><option value="keep_separate">Keep Google and Microsoft events separate</option></select></label><button style={button} disabled={working} onClick={()=>void runAction("update-calendar-controls",{googleSyncEnabled:settings.google_sync_enabled,microsoftSyncEnabled:settings.microsoft_sync_enabled,conflictMode:settings.conflict_mode})}>Save Calendar Controls</button></section>}
    <section style={card}><h2 style={{marginTop:0}}>Create Manual Event</h2><p style={{color:"#64748b"}}>Organization owners, admins, and managers can publish events that are not supplied by a connected calendar.</p><label><strong>Title</strong><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Event title" style={input}/></label><label><strong>Description</strong><textarea value={description} onChange={e=>setDescription(e.target.value)} rows={3} style={input}/></label><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}><label><strong>Starts</strong><input type="datetime-local" value={startsAt} onChange={e=>setStartsAt(e.target.value)} style={input}/></label><label><strong>Ends</strong><input type="datetime-local" value={endsAt} onChange={e=>setEndsAt(e.target.value)} style={input}/></label><label><strong>Location name</strong><input value={locationName} onChange={e=>setLocationName(e.target.value)} placeholder="Community Center" style={input}/></label><label><strong>Address</strong><input value={locationAddress} onChange={e=>setLocationAddress(e.target.value)} placeholder="Event address" style={input}/></label></div><div style={{display:"flex",gap:18,flexWrap:"wrap",alignItems:"center",marginBottom:14}}><label><input type="checkbox" checked={allDay} onChange={e=>setAllDay(e.target.checked)}/> All-day event</label><label><input type="checkbox" checked={rideCoordinationEnabled} onChange={e=>setRideCoordinationEnabled(e.target.checked)}/> Enable ride coordination</label><label><strong>Visibility </strong><select value={visibility} onChange={e=>setVisibility(e.target.value)}><option value="organization">Organization</option><option value="private">Private</option></select></label></div><button style={button} onClick={async()=>{const saved=await runAction("create-manual",{description:description||null,locationName:locationName||null,locationAddress:locationAddress||null,startsAt:new Date(startsAt).toISOString(),endsAt:endsAt?new Date(endsAt).toISOString():null,allDay,visibility,rideCoordinationEnabled});if(saved){setTitle("");setDescription("");setLocationName("");setLocationAddress("");setStartsAt("");setEndsAt("");}}} disabled={working||!organizationId||!title.trim()||!startsAt}>Create Event</button></section>
    {message&&<p style={{...card,background:"#eef2ff",fontWeight:750}}>{message}</p>}
    {controls&&controls.conflicts?.length>0&&<section style={card}><h2 style={{marginTop:0}}>Duplicate &amp; Conflict History</h2>{controls.conflicts.map((conflict:Row)=><div key={conflict.id} style={{padding:"11px 0",borderTop:"1px solid #e2e8f0"}}><strong>{conflict.imported_title}</strong> · {conflict.provider}<div style={{fontSize:13,color:"#64748b"}}>{conflict.conflict_type.replaceAll("_"," ")} · {conflict.resolution.replaceAll("_"," ")} · compared with {conflict.existing_title}</div></div>)}</section>}
    <section style={card}><h2 style={{marginTop:0}}>Events</h2>{events.length===0?<p>No events loaded for this organization.</p>:events.map(event=><div key={event.id} style={{padding:"10px 0",borderBottom:"1px solid #eee"}}><strong>{event.title}</strong> · {event.source_type}{event.starts_at?` · ${new Date(event.starts_at).toLocaleString()}`:""}</div>)}</section>
  </main>;
}
