"use client";

import { useEffect,useState } from "react";
import { AppNav,appCardStyle,appPageStyle } from "@/components/app-nav";

type Row=Record<string,any>;

export default function SafetyPage(){
  const [data,setData]=useState<Row|null>(null);const [message,setMessage]=useState("");const [working,setWorking]=useState(false);
  async function load(){const r=await fetch("/api/safety");const x=await r.json().catch(()=>({}));if(r.status===401){location.href="/login";return;}if(!r.ok){setMessage(x.error||"Unable to load safety tools");return;}setData(x.context);}
  useEffect(()=>{void load();},[]);
  async function trigger(rideId:string,alertType="help"){
    setWorking(true);setMessage("Preparing safety alert…");
    let location:Row={};
    if(navigator.geolocation){
      location=await new Promise<Row>(resolve=>navigator.geolocation.getCurrentPosition(
        p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude}),()=>resolve({}),{enableHighAccuracy:false,timeout:4000,maximumAge:60000}
      ));
    }
    const r=await fetch("/api/safety",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"trigger",rideId,alertType,...location})});
    const x=await r.json().catch(()=>({}));setWorking(false);
    if(!r.ok){setMessage(x.error||"Unable to send safety alert");return;}
    setData(x.context);setMessage(`Safety alert sent to ${x.result?.recipientCount??0} ride safety contact(s). If this is an emergency, call 911 now.`);
  }
  async function resolve(alertId:string){setWorking(true);const r=await fetch("/api/safety",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"resolve",alertId})});const x=await r.json().catch(()=>({}));setWorking(false);if(!r.ok){setMessage(x.error||"Unable to resolve alert");return;}setData(x.context);setMessage("Safety alert marked resolved.");}
  const red={display:"inline-block",padding:"12px 16px",borderRadius:10,border:0,background:"#b91c1c",color:"white",fontWeight:900,textDecoration:"none",cursor:"pointer"} as const;
  const button={padding:"10px 13px",border:"1px solid #cbd5e1",borderRadius:9,background:"white",fontWeight:800,cursor:"pointer"} as const;
  return <main style={appPageStyle}><AppNav active="Safety"/>
    <section style={{...appCardStyle,marginBottom:18,border:"2px solid #fecaca"}}>
      <div style={{fontSize:13,fontWeight:900,letterSpacing:1,color:"#991b1b"}}>EMERGENCY ASSIST</div>
      <h1 style={{margin:"7px 0 8px"}}>Need help during a ride?</h1>
      <p style={{color:"#475569",lineHeight:1.6}}>BandWagon can alert your ride safety circle, but it is <strong>not an emergency dispatch service</strong>. For an immediate emergency, call 911.</p>
      <a href="tel:911" style={red}>Call 911</a>
    </section>
    {!data?<section style={appCardStyle}>Loading safety tools…</section>:<>
      <section style={{...appCardStyle,marginBottom:18}}><h2 style={{marginTop:0}}>Active Rides</h2>{!data.rides?.length?<p>No active rides in your safety circle.</p>:data.rides.map((r:Row)=><div key={r.id} style={{padding:"14px 0",borderBottom:"1px solid #e2e8f0"}}><div><strong>{r.event_title||"BandWagon ride"}</strong> · {r.passenger_name}<div style={{fontSize:13,color:"#64748b",marginTop:3}}>Driver: {r.driver_name} · {String(r.status).replaceAll("_"," ")}</div></div><div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}><button disabled={working} onClick={()=>trigger(r.id,"help")} style={{...red,padding:"9px 12px"}}>I Need Help</button><button disabled={working} onClick={()=>trigger(r.id,"guardian_alert")} style={button}>Alert My Safety Circle</button></div></div>)}</section>
      <section style={appCardStyle}><h2 style={{marginTop:0}}>Safety Alerts</h2>{!data.alerts?.length?<p>No safety alerts.</p>:data.alerts.map((a:Row)=><div key={a.id} style={{padding:"12px 0",borderBottom:"1px solid #e2e8f0"}}><strong>{String(a.alert_type).replaceAll("_"," ")}</strong> · {a.status}<div style={{fontSize:13,color:"#64748b",marginTop:3}}>{a.event_title||"Ride"} · triggered by {a.triggered_by} · {new Date(a.created_at).toLocaleString()}</div>{a.status!=="resolved"&&<button disabled={working} onClick={()=>resolve(a.id)} style={{...button,marginTop:8}}>Mark Resolved</button>}</div>)}</section>
    </>}
    {message&&<div style={{position:"fixed",right:20,bottom:20,maxWidth:520,padding:14,borderRadius:12,background:"#101b33",color:"white"}}>{message}</div>}
  </main>;
}
