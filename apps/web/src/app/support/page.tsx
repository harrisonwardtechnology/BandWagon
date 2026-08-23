"use client";

import { useState } from "react";

const options=[
  {cents:100,label:"$1",rides:"about 4 rides",drivers:"about 2 driver validations"},
  {cents:500,label:"$5",rides:"about 20 rides",drivers:"about 10 driver validations"},
  {cents:1000,label:"$10",rides:"about 40 rides",drivers:"about 20 driver validations"},
  {cents:2500,label:"$25",rides:"about 100 rides",drivers:"about 50 driver validations"},
];

export default function SupportPage(){
  const [loading,setLoading]=useState<number|null>(null);const [message,setMessage]=useState("");
  async function checkout(amountCents:number){setLoading(amountCents);setMessage("");try{const r=await fetch("/api/support/checkout",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({type:"individual",amountCents})});const d=await r.json();if(!r.ok)return setMessage(d.error||"Unable to start checkout");location.href=d.checkoutUrl;}finally{setLoading(null);}}
  return <main style={{maxWidth:760,margin:"40px auto",padding:"0 20px",fontFamily:"system-ui,sans-serif"}}>
    <section style={{background:"#101b33",color:"#fff",padding:32,borderRadius:24}}><div style={{fontSize:13,fontWeight:800,letterSpacing:1}}>COMMUNITY SUPPORT</div><h1 style={{fontSize:40,margin:"8px 0"}}>Help keep BandWagon rolling - and drivers ready</h1><p style={{fontSize:18,lineHeight:1.6}}>BandWagon is provided free to your organization. A typical ride costs about <strong>$0.25</strong> to coordinate, and validating a driver costs about <strong>$0.50</strong> in document processing, secure storage, and verification services.</p><p style={{fontSize:18,lineHeight:1.6}}>If BandWagon helped your family today, consider chipping in to help cover the next ride or driver validation.</p></section>
    <section style={{marginTop:24,padding:24,border:"1px solid #dbe3ef",borderRadius:18}}><div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:12}}>{options.map(o=><button key={o.cents} disabled={loading!==null} onClick={()=>checkout(o.cents)} style={{padding:20,border:"1px solid #cbd5e1",borderRadius:14,background:"#fff",cursor:"pointer"}}><div style={{fontSize:26,fontWeight:800}}>{o.label}</div><div>{o.rides}</div><div style={{fontSize:13,color:"#64748b",marginTop:5}}>or {o.drivers}</div></button>)}</div>{message&&<p>{message}</p>}<p style={{marginTop:22,color:"#475569"}}>Completely optional. BandWagon works the same whether you contribute or not. Contributions support BandWagon operations and are not represented as tax-deductible charitable donations.</p><p style={{color:"#64748b",fontSize:14}}>Impact amounts are planning estimates, not a promise that a contribution is restricted to a particular ride or validation. Minimum contribution is $1. Payment options are presented by Stripe when available on your device.</p></section>
  </main>;
}
