"use client";

import { useEffect,useState } from "react";
import { AppNav,appCardStyle,appPageStyle } from "@/components/app-nav";

type Row=Record<string,any>;

export default function AppHomePage(){
  const [dashboard,setDashboard]=useState<Row|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{ fetch("/api/product").then(async r=>{const d=await r.json();if(r.status===401){window.location.href="/login";return;} if(!r.ok) throw new Error(d.error||"Unable to load BandWagon"); setDashboard(d.dashboard);}).catch(e=>setError(e.message)); },[]);
  return <main style={{...appPageStyle,minHeight:"100vh"}}>
    <AppNav active="Home"/>
    {error&&<div style={{...appCardStyle,background:"#fff7ed"}}>{error}</div>}
    {!dashboard?<div style={appCardStyle}>Loading your BandWagon…</div>:<>
      <section style={{...appCardStyle,background:"#101b33",color:"white",marginBottom:18}}>
        <div style={{fontSize:13,fontWeight:850,letterSpacing:1,opacity:.75}}>WELCOME BACK</div>
        <h1 style={{fontSize:34,margin:"6px 0"}}>{dashboard.identity.displayName}</h1>
        <p style={{margin:0,opacity:.85}}>Your next ride should take a few taps, not a group-text archaeology project.</p>
      </section>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:16}}>
        <a href="/app/rides" style={{...appCardStyle,textDecoration:"none",color:"inherit"}}><div style={{fontSize:30,fontWeight:900}}>{dashboard.requests.filter((r:Row)=>['open','pending_approval','matched'].includes(r.status)).length}</div><b>Active ride requests</b><p style={{color:"#64748b",marginBottom:0}}>Request, review offers, and track rides.</p></a>
        <a href="/app/household" style={{...appCardStyle,textDecoration:"none",color:"inherit"}}><div style={{fontSize:30,fontWeight:900}}>{dashboard.people.length}</div><b>Household riders</b><p style={{color:"#64748b",marginBottom:0}}>Parents, guardians, and students you manage.</p></a>
        <a href="/app/driver" style={{...appCardStyle,textDecoration:"none",color:"inherit"}}><div style={{fontSize:30,fontWeight:900}}>{dashboard.openRequests.length}</div><b>Rides needing help</b><p style={{color:"#64748b",marginBottom:0}}>See requests that may fit your route.</p></a>
        <div style={appCardStyle}><div style={{fontSize:30,fontWeight:900}}>{dashboard.events.length}</div><b>Upcoming events</b><p style={{color:"#64748b",marginBottom:0}}>Synced events available for ride coordination.</p></div>
      </div>
      <section style={{...appCardStyle,marginTop:18}}><h2 style={{marginTop:0}}>Organizations</h2>{dashboard.organizations.length?dashboard.organizations.map((o:Row)=><div key={o.id} style={{padding:"10px 0",borderBottom:"1px solid #f1f5f9"}}><b>{o.name}</b> <span style={{color:"#64748b"}}>· {o.role}</span></div>):<p>You have not joined an organization yet. Go to Household to enter a join code.</p>}</section>
    </>}
  </main>;
}
