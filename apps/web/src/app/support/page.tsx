"use client";

import { useState } from "react";

const options = [
  { cents: 100, label: "$1", rides: "about 4 rides" },
  { cents: 500, label: "$5", rides: "about 20 rides" },
  { cents: 1000, label: "$10", rides: "about 40 rides" },
  { cents: 2500, label: "$25", rides: "about 100 rides" },
];

export default function SupportPage() {
  const [loading,setLoading]=useState<number|null>(null);
  const [message,setMessage]=useState("");

  async function checkout(amountCents:number){
    setLoading(amountCents); setMessage("");
    try {
      const r=await fetch("/api/support/checkout",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({type:"individual",amountCents})
      });
      const d=await r.json();
      if(!r.ok) return setMessage(d.error||"Unable to start checkout");
      location.href=d.checkoutUrl;
    } finally { setLoading(null); }
  }

  return <main style={{maxWidth:760,margin:"40px auto",padding:"0 20px",fontFamily:"system-ui,sans-serif"}}>
    <section style={{background:"#101b33",color:"#fff",padding:32,borderRadius:24}}>
      <div style={{fontSize:13,fontWeight:800,letterSpacing:1}}>COMMUNITY SUPPORT</div>
      <h1 style={{fontSize:40,margin:"8px 0"}}>Help keep BandWagon rolling</h1>
      <p style={{fontSize:18,lineHeight:1.6}}>
        BandWagon is provided free to your organization. A typical ride costs about <strong>$0.25</strong> in technology,
        messaging, maps, and other operating services to coordinate.
      </p>
      <p style={{fontSize:18,lineHeight:1.6}}>
        If BandWagon helped your family today, consider chipping in to help cover the next ride.
      </p>
    </section>

    <section style={{marginTop:24,padding:24,border:"1px solid #dbe3ef",borderRadius:18}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:12}}>
        {options.map(o=><button key={o.cents} onClick={()=>checkout(o.cents)}
          style={{padding:20,border:"1px solid #cbd5e1",borderRadius:14,background:"#fff",cursor:"pointer"}}>
          <div style={{fontSize:26,fontWeight:800}}>{o.label}</div>
          <div>{o.rides}</div>
        </button>)}
      </div>
      {message&&<p>{message}</p>}
      <p style={{marginTop:22,color:"#475569"}}>
        Completely optional. BandWagon works the same whether you contribute or not.
        Contributions support BandWagon operations and are not represented as tax-deductible charitable donations.
      </p>
      <p style={{color:"#64748b",fontSize:14}}>
        Minimum contribution is $1. Payment options such as Apple Pay, Google Pay, Link, and cards are presented by Stripe when available on your device.
      </p>
    </section>
  </main>;
}
