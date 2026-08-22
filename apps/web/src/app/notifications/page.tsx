"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String:string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export default function NotificationsPage() {
  const [supported,setSupported]=useState(false);
  const [permission,setPermission]=useState<NotificationPermission|undefined>(undefined);
  const [subscribed,setSubscribed]=useState(false);
  const [message,setMessage]=useState("");

  useEffect(()=>{
    const ok="serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(ok);
    if(ok){
      setPermission(Notification.permission);
      navigator.serviceWorker.ready.then(reg=>reg.pushManager.getSubscription()).then(sub=>setSubscribed(Boolean(sub)));
    }
  },[]);

  async function enable(){
    setMessage("");
    const publicKey=process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if(!publicKey) return setMessage("Push notifications are not configured on this BandWagon deployment.");

    const result=await Notification.requestPermission();
    setPermission(result);
    if(result!=="granted") return setMessage("Notifications were not enabled.");

    const reg=await navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription();
    if(!sub){
      sub=await reg.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:urlBase64ToUint8Array(publicKey),
      });
    }

    const json=sub.toJSON();
    const r=await fetch("/api/push/subscribe",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({
        endpoint:json.endpoint,
        keys:json.keys,
        deviceLabel:navigator.userAgent.includes("iPhone")?"iPhone":navigator.userAgent.includes("Android")?"Android":"Browser",
      })
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok) return setMessage(d.error||"Unable to save push subscription.");
    setSubscribed(true);
    setMessage("Push notifications are enabled on this device.");
  }

  async function disable(){
    const reg=await navigator.serviceWorker.ready;
    const sub=await reg.pushManager.getSubscription();
    if(sub){
      await fetch("/api/push/unsubscribe",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({endpoint:sub.endpoint})
      }).catch(()=>{});
      await sub.unsubscribe();
    }
    setSubscribed(false);
    setMessage("Push notifications are disabled on this device.");
  }

  return <main style={{maxWidth:760,margin:"40px auto",padding:"0 20px",fontFamily:"system-ui,sans-serif"}}>
    <section style={{background:"#101b33",color:"#fff",padding:30,borderRadius:24}}>
      <div style={{fontSize:13,fontWeight:800,letterSpacing:1}}>BANDWAGON NOTIFICATIONS</div>
      <h1 style={{fontSize:38,margin:"8px 0"}}>Stay updated without extra texts</h1>
      <p style={{fontSize:18,lineHeight:1.6}}>
        Push notifications can deliver routine ride updates directly to this device.
        SMS/RCS can then be reserved for the messages that matter most.
      </p>
    </section>

    <section style={{marginTop:22,padding:24,border:"1px solid #dbe3ef",borderRadius:18}}>
      <p>Browser/PWA support: <strong>{supported?"Supported":"Not supported"}</strong></p>
      <p>Permission: <strong>{permission||"Unknown"}</strong></p>
      <p>This device: <strong>{subscribed?"Subscribed":"Not subscribed"}</strong></p>

      {!subscribed
        ? <button disabled={!supported} onClick={enable} style={{padding:"12px 18px"}}>Enable Push Notifications</button>
        : <button onClick={disable} style={{padding:"12px 18px"}}>Disable Push Notifications</button>
      }

      {message&&<p style={{marginTop:16,padding:14,background:"#f8fafc",borderRadius:10}}>{message}</p>}

      <p style={{marginTop:24,color:"#475569"}}>
        Push is optional. Important ride alerts can still be delivered through the notification methods you choose.
      </p>

      <p style={{fontSize:14,color:"#64748b"}}>
        On iPhone/iPad, web push requires iOS/iPadOS 16.4 or later and BandWagon must be installed on the Home Screen as a web app.
      </p>
    </section>
  </main>;
}
