"use client";

import { FormEvent, useState } from "react";

type Status = {
  configured?: boolean;
  browserMapsConfigured?: boolean;
  serverMapsConfigured?: boolean;
  connected?: boolean;
  account?: { email?: string; displayName?: string } | null;
  calendars?: Array<{ external_calendar_id: string; summary: string; selected: boolean; last_sync_at?: string | null; sync_error?: string | null }>;
};
type GoogleCalendar = { id: string; summary: string; primary: boolean; accessRole: string; timeZone?: string | null };

export default function GoogleIntegrationAdmin() {
  const [token,setToken]=useState(""); const [status,setStatus]=useState<Status|null>(null); const [calendars,setCalendars]=useState<GoogleCalendar[]>([]);
  const [selected,setSelected]=useState<string[]>([]); const [address,setAddress]=useState("901 Long Prairie Rd, Flower Mound, TX 75022"); const [geo,setGeo]=useState<any>(null); const [message,setMessage]=useState("");
  const jsonHeaders=()=>({"content-type":"application/json","x-bandwagon-admin-token":token});
  async function loadStatus(){ setMessage(""); const r=await fetch("/api/admin/integrations/google",{headers:{"x-bandwagon-admin-token":token}}); const d=await r.json().catch(()=>({error:"Invalid response"})); if(!r.ok)return setMessage(d.error||"Unable to load status"); setStatus(d); }
  async function connect(){ const r=await fetch("/api/admin/integrations/google",{method:"POST",headers:jsonHeaders()}); const d=await r.json(); if(!r.ok)return setMessage(d.error||"Unable to start OAuth"); location.href=d.authorizationUrl; }
  async function loadCalendars(){ const r=await fetch("/api/admin/integrations/google/calendars",{headers:{"x-bandwagon-admin-token":token}}); const d=await r.json(); if(!r.ok)return setMessage(d.error||"Unable to list calendars"); setCalendars(d.calendars||[]); setSelected(status?.calendars?.filter(c=>c.selected).map(c=>c.external_calendar_id)||[]); }
  async function saveCalendars(){ const r=await fetch("/api/admin/integrations/google/calendars",{method:"POST",headers:jsonHeaders(),body:JSON.stringify({calendarIds:selected})}); const d=await r.json(); setMessage(r.ok?`Saved ${d.selected} selected calendar(s).`:d.error||"Save failed"); if(r.ok)await loadStatus(); }
  async function sync(){ setMessage("Syncing..."); const r=await fetch("/api/admin/integrations/google/sync",{method:"POST",headers:jsonHeaders()}); const d=await r.json(); setMessage(r.ok?`Synced ${d.events} event(s) from ${d.calendars} calendar(s).`:d.error||"Sync failed"); if(r.ok)await loadStatus(); }
  async function geocode(e:FormEvent){ e.preventDefault(); setGeo(null); const r=await fetch("/api/admin/integrations/google/geocode",{method:"POST",headers:jsonHeaders(),body:JSON.stringify({address})}); const d=await r.json(); if(!r.ok)return setMessage(d.error||"Geocode failed"); setGeo(d); setMessage("Server-side Google geocoding is working."); }
  const btn={padding:"10px 14px",borderRadius:8,border:"1px solid #cbd5e1",background:"#fff",cursor:"pointer"} as const;
  return <main style={{maxWidth:1000,margin:"40px auto",padding:"0 20px",fontFamily:"system-ui,sans-serif"}}>
    <section style={{background:"#101b33",color:"white",padding:28,borderRadius:22}}><div style={{fontSize:13,fontWeight:800,letterSpacing:1}}>PLATFORM ADMIN</div><h1 style={{fontSize:38,margin:"6px 0"}}>Google Integration</h1><p style={{margin:0,opacity:.9}}>Calendar OAuth, event sync, Maps configuration, and geocoding diagnostics.</p></section>
    <section style={{marginTop:20,padding:20,border:"1px solid #dbe3ef",borderRadius:16}}><label><strong>Admin Test Token</strong></label><input type="password" value={token} onChange={e=>setToken(e.target.value)} style={{display:"block",width:"100%",padding:12,margin:"8px 0 14px",border:"1px solid #cbd5e1",borderRadius:8}}/><div style={{display:"flex",gap:10,flexWrap:"wrap"}}><button style={btn} onClick={loadStatus}>Refresh Status</button><button style={btn} onClick={connect}>Connect Google Calendar</button><button style={btn} onClick={loadCalendars}>Load Calendars</button><button style={btn} onClick={sync}>Sync Selected Calendars</button></div></section>
    {message&&<p style={{padding:14,background:"#f8fafc",borderRadius:10}}>{message}</p>}
    {status&&<section style={{marginTop:20,padding:20,border:"1px solid #dbe3ef",borderRadius:16}}><h2>Integration Status</h2><p>OAuth configured: <strong>{status.configured?"Yes":"No"}</strong></p><p>Google account connected: <strong>{status.connected?"Yes":"No"}</strong></p><p>Browser Maps key: <strong>{status.browserMapsConfigured?"Configured":"Missing"}</strong></p><p>Server Maps key: <strong>{status.serverMapsConfigured?"Configured":"Missing"}</strong></p>{status.account&&<p>Connected account: <strong>{status.account.email}</strong></p>}{status.calendars?.length?<><h3>Saved calendars</h3><ul>{status.calendars.map(c=><li key={c.external_calendar_id}>{c.summary} — {c.selected?"Selected":"Not selected"}{c.last_sync_at?` — last sync ${new Date(c.last_sync_at).toLocaleString()}`:""}{c.sync_error?` — ERROR: ${c.sync_error}`:""}</li>)}</ul></>:null}</section>}
    {calendars.length>0&&<section style={{marginTop:20,padding:20,border:"1px solid #dbe3ef",borderRadius:16}}><h2>Select Calendars</h2>{calendars.map(cal=><label key={cal.id} style={{display:"block",padding:"10px 0",borderBottom:"1px solid #eef2f7"}}><input type="checkbox" checked={selected.includes(cal.id)} onChange={e=>setSelected(prev=>e.target.checked?[...new Set([...prev,cal.id])]:prev.filter(x=>x!==cal.id))}/> <strong>{cal.summary}</strong>{cal.primary?" (Primary)":""} — {cal.accessRole}</label>)}<button style={{...btn,marginTop:14}} onClick={saveCalendars}>Save Calendar Selection</button></section>}
    <section style={{marginTop:20,padding:20,border:"1px solid #dbe3ef",borderRadius:16}}><h2>Server Geocoding Test</h2><form onSubmit={geocode}><input value={address} onChange={e=>setAddress(e.target.value)} style={{width:"100%",padding:12,border:"1px solid #cbd5e1",borderRadius:8}}/><button style={{...btn,marginTop:10}} type="submit">Test Geocoding</button></form>{geo&&<pre style={{whiteSpace:"pre-wrap",background:"#f8fafc",padding:14,borderRadius:10}}>{JSON.stringify(geo,null,2)}</pre>}</section>
  </main>;
}
