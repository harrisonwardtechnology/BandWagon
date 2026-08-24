"use client";

import { useEffect,useState } from "react";

export default function OfflineStatus(){
  const[offline,setOffline]=useState(false);
  useEffect(()=>{const update=()=>setOffline(!navigator.onLine);update();window.addEventListener("online",update);window.addEventListener("offline",update);return()=>{window.removeEventListener("online",update);window.removeEventListener("offline",update);};},[]);
  if(!offline)return null;
  return <div role="status" aria-live="polite" style={{position:"sticky",top:0,zIndex:1000,padding:"10px 16px",background:"#fef3c7",color:"#78350f",textAlign:"center",fontWeight:800}}>You’re offline. Current ride and account data is unavailable until you reconnect.</div>;
}
