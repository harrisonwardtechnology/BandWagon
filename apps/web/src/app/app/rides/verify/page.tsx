"use client";

import { useEffect,useMemo,useState } from "react";
import QRCode from "qrcode";
import { AppNav,appCardStyle,appPageStyle } from "@/components/app-nav";

type H=Record<string,any>;

export default function PickupVerifyPage(){
  const [rideId,setRideId]=useState("");const [token,setToken]=useState("");const [h,setH]=useState<H|null>(null);const [qr,setQr]=useState("");const [fallback,setFallback]=useState("");const [code,setCode]=useState("");const [message,setMessage]=useState("");const [working,setWorking]=useState(false);
  useEffect(()=>{const u=new URL(location.href);setRideId(u.searchParams.get("rideId")||"");setToken(u.searchParams.get("token")||"");},[]);
  useEffect(()=>{if(token)void resolveToken(token);else if(rideId)void load(rideId);},[rideId,token]);
  async function load(id:string){const r=await fetch(`/api/pickup-handshake?rideId=${encodeURIComponent(id)}`);const x=await r.json().catch(()=>({}));if(!r.ok){setMessage(x.error||"Unable to load pickup verification");return;}setH(x.result.handshake||null);}
  async function resolveToken(value:string){const r=await fetch(`/api/pickup-handshake?token=${encodeURIComponent(value)}`);const x=await r.json().catch(()=>({}));if(!r.ok){setMessage(x.error||"Unable to verify pickup code");return;}setH(x.result);setRideId(x.result.rideId||"");}
  async function start(){setWorking(true);setMessage("");const r=await fetch("/api/pickup-handshake",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"start",rideId})});const x=await r.json().catch(()=>({}));setWorking(false);if(!r.ok){setMessage(x.error||"Unable to start pickup verification");return;}setH(x.result);setFallback(x.result.fallbackCode||"");if(x.result.token){const url=`${location.origin}/app/rides/verify?token=${encodeURIComponent(x.result.token)}`;setQr(await QRCode.toDataURL(url,{width:320,margin:2,errorCorrectionLevel:"M"}));}}
  async function resolveCode(){setWorking(true);const r=await fetch("/api/pickup-handshake",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"resolve_code",rideId,code})});const x=await r.json().catch(()=>({}));setWorking(false);if(!r.ok){setMessage(x.error||"Code does not match");return;}setH(x.result);setMessage("Code accepted. Compare the phrase on both screens.");}
  async function confirm(){if(!h?.id)return;setWorking(true);const r=await fetch("/api/pickup-handshake",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"confirm",handshakeId:h.id})});const x=await r.json().catch(()=>({}));setWorking(false);if(!r.ok){setMessage(x.error||"Unable to confirm pickup");return;}setH(x.result);setMessage(x.result.status==="verified"?"Pickup verified.":"Your side is confirmed. Waiting for the other person.");}
  const phrase=useMemo(()=>h?`${h.phraseColor} ${h.phraseWord}`:"",[h]);
  const button={padding:"12px 16px",border:0,borderRadius:10,background:"#101b33",color:"white",fontWeight:900,cursor:"pointer"} as const;
  return <main style={appPageStyle}><AppNav active="Rides"/>
    <section style={{...appCardStyle,maxWidth:720,margin:"0 auto 18px"}}><div style={{fontSize:13,fontWeight:900,letterSpacing:1,color:"#64748b"}}>VERIFIED PICKUP</div><h1 style={{margin:"7px 0"}}>Make sure you have the right ride.</h1><p style={{color:"#475569",lineHeight:1.6}}>Scan the one-time QR or enter the four-digit fallback code. Both sides then compare the same color, word, and icon before confirming.</p>
      {!h&&rideId&&<button disabled={working} onClick={start} style={button}>Start Pickup Verification</button>}
      {!h&&rideId&&<div style={{marginTop:16}}><label style={{fontWeight:800}}>Or enter the 4-digit code</label><div style={{display:"flex",gap:8,marginTop:7}}><input inputMode="numeric" maxLength={4} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,""))} style={{flex:1,padding:12,border:"1px solid #cbd5e1",borderRadius:9,fontSize:22,letterSpacing:5,textAlign:"center"}}/><button disabled={working||code.length!==4} onClick={resolveCode} style={button}>Verify</button></div></div>}
    </section>
    {h&&<section style={{...appCardStyle,maxWidth:720,margin:"0 auto",textAlign:"center"}}><div style={{fontSize:14,fontWeight:900,color:"#64748b"}}>COMPARE BOTH SCREENS</div><div style={{margin:"18px auto",padding:"34px 20px",borderRadius:24,background:h.phraseColor?.toLowerCase()==="yellow"?"#fef3c7":h.phraseColor?.toLowerCase()==="pink"?"#fce7f3":h.phraseColor?.toLowerCase()==="green"?"#dcfce7":h.phraseColor?.toLowerCase()==="orange"?"#ffedd5":h.phraseColor?.toLowerCase()==="purple"?"#f3e8ff":"#dbeafe"}}><div style={{fontSize:64}}>{h.phraseIcon}</div><div style={{fontSize:42,fontWeight:950,marginTop:8}}>{phrase}</div></div>
      <p style={{fontWeight:800}}>Does the other person's screen show exactly the same phrase and icon?</p><button disabled={working||h.status==="verified"} onClick={confirm} style={{...button,fontSize:18,minWidth:220}}>{h.status==="verified"?"✓ Pickup Verified":"Yes - Confirm"}</button>
      {h.status!=="verified"&&<p style={{color:"#64748b"}}>One confirmation is not enough. BandWagon verifies pickup only after both sides confirm.</p>}
      {qr&&<div style={{marginTop:28,borderTop:"1px solid #e2e8f0",paddingTop:24}}><h3>Have the rider scan this QR</h3><img alt="One-time pickup verification QR code" src={qr} style={{width:280,maxWidth:"100%"}}/>{fallback&&<div style={{fontSize:13,color:"#64748b"}}>Camera not working? Code: <strong style={{fontSize:20,color:"#0f172a"}}>{fallback}</strong></div>}</div>}
    </section>}
    {message&&<div style={{position:"fixed",right:20,bottom:20,maxWidth:520,padding:14,borderRadius:12,background:"#101b33",color:"white"}}>{message}</div>}
  </main>;
}
