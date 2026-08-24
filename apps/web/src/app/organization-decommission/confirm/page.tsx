"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function ConfirmOrganizationDecommissionContent(){
  const params=useSearchParams();
  const token=params.get("token")||"";
  const [message,setMessage]=useState("This link confirms a destructive organization-removal request. Nothing happens until you press the button below.");
  const [done,setDone]=useState(false);
  async function confirm(){
    setMessage("Confirming...");
    const r=await fetch("/api/admin/organization-decommission/confirm",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){setMessage(d.error||"Unable to confirm this request");return;}
    setDone(true);setMessage("Organization removal confirmed. BandWagon has started the controlled decommission workflow and will notify affected members about their data disposition.");
  }
  return <main style={{maxWidth:720,margin:"60px auto",padding:"0 20px",fontFamily:"system-ui,sans-serif"}}><section style={{border:"1px solid #fecaca",background:"#fff7f7",padding:28,borderRadius:20}}><div style={{fontSize:13,fontWeight:900,letterSpacing:1,color:"#991b1b"}}>ORGANIZATION REMOVAL CONFIRMATION</div><h1 style={{color:"#101b33"}}>Confirm this request</h1><p style={{lineHeight:1.6}}>{message}</p>{!done&&<><p><strong>Only continue if you personally requested the organization removal.</strong> If you did not, close this page and contact BandWagon Support.</p><button disabled={!token} onClick={confirm} style={{background:"#991b1b",color:"white",border:0,borderRadius:10,padding:"12px 18px",fontWeight:800,cursor:"pointer"}}>Confirm Organization Removal</button></>}</section></main>;
}

export default function ConfirmOrganizationDecommissionPage(){
  return <Suspense fallback={<main style={{maxWidth:720,margin:"60px auto",padding:"0 20px",fontFamily:"system-ui,sans-serif"}}><section style={{border:"1px solid #e2e8f0",background:"#fff",padding:28,borderRadius:20}}>Loading confirmation…</section></main>}><ConfirmOrganizationDecommissionContent/></Suspense>;
}
