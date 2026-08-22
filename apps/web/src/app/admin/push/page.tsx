"use client";

import { useState } from "react";

export default function PushAdmin() {
  const [token,setToken]=useState("");
  const [status,setStatus]=useState<any>(null);
  const [title,setTitle]=useState("BandWagon");
  const [body,setBody]=useState("Push notifications are working. This can replace routine SMS messages.");
  const [message,setMessage]=useState("");

  async function refresh(){
    const r=await fetch("/api/admin/push/test",{headers:{"x-bandwagon-admin-token":token}});
    const d=await r.json().catch(()=>({}));
    if(!r.ok) return setMessage(d.error||"Unable to load push status");
    setStatus(d); setMessage("");
  }

  async function test(){
    setMessage("Sending push test...");
    const r=await fetch("/api/admin/push/test",{
      method:"POST",
      headers:{"content-type":"application/json","x-bandwagon-admin-token":token},
      body:JSON.stringify({title,body,url:"/notifications"})
    });
    const d=await r.json().catch(()=>({}));
    setMessage(r.ok?`Push test: ${d.sent} sent, ${d.failed} failed, ${d.subscriptions} subscription(s).`:d.error||"Push test failed");
    if(r.ok) await refresh();
  }

  return <main style={{maxWidth:850,margin:"40px auto",padding:"0 20px",fontFamily:"system-ui,sans-serif"}}>
    <section style={{background:"#101b33",color:"#fff",padding:28,borderRadius:22}}>
      <div style={{fontSize:13,fontWeight:800,letterSpacing:1}}>PLATFORM ADMIN</div>
      <h1 style={{fontSize:38,margin:"6px 0"}}>Push Notifications</h1>
      <p style={{margin:0,opacity:.9}}>Test low-cost PWA push delivery before using SMS/RCS.</p>
    </section>

    <section style={{marginTop:20,padding:20,border:"1px solid #dbe3ef",borderRadius:16}}>
      <label><strong>Admin Test Token</strong></label>
      <input type="password" value={token} onChange={e=>setToken(e.target.value)}
        style={{display:"block",width:"100%",padding:12,margin:"8px 0 14px"}}/>
      <button onClick={refresh}>Refresh Status</button>
    </section>

    {status&&<section style={{marginTop:20,padding:20,border:"1px solid #dbe3ef",borderRadius:16}}>
      <p>VAPID configured: <strong>{status.configured?"Yes":"No"}</strong></p>
      <p>Active subscriptions: <strong>{status.activeSubscriptions}</strong></p>
      <p>Revoked subscriptions: <strong>{status.revokedSubscriptions}</strong></p>
    </section>}

    <section style={{marginTop:20,padding:20,border:"1px solid #dbe3ef",borderRadius:16}}>
      <h2>Send Test Push</h2>
      <input value={title} onChange={e=>setTitle(e.target.value)} style={{display:"block",width:"100%",padding:12,margin:"8px 0"}}/>
      <textarea value={body} onChange={e=>setBody(e.target.value)} rows={4}
        style={{display:"block",width:"100%",padding:12,margin:"8px 0 14px"}}/>
      <button onClick={test}>Send to Active Test Devices</button>
      {message&&<p style={{padding:14,background:"#f8fafc",borderRadius:10}}>{message}</p>}
    </section>
  </main>;
}
