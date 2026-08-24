"use client";

import { useState } from "react";

const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default function LoginPage() {
  const [identifier,setIdentifier] = useState("");
  const [displayName,setDisplayName] = useState("");
  const [householdName,setHouseholdName] = useState("");
  const [birthMonth,setBirthMonth] = useState("");
  const [birthYear,setBirthYear] = useState("");
  const [challengeId,setChallengeId] = useState("");
  const [code,setCode] = useState("");
  const [mode,setMode] = useState<"sign_in"|"create_account">("sign_in");
  const [message,setMessage] = useState("");
  const [working,setWorking] = useState(false);

  async function requestCode() {
    setWorking(true); setMessage("");
    const r = await fetch("/api/auth/otp", {
      method:"POST", headers:{"content-type":"application/json"},
      body:JSON.stringify({
        action:"request",identifier,displayName:displayName||null,householdName:householdName||null,
        birthMonth:birthMonth||null,birthYear:birthYear||null,
        signupIntent:mode==="create_account",
      })
    });
    const d = await r.json().catch(()=>({}));
    setWorking(false);
    if (d.underAge) { setMessage(d.message || "A parent or guardian must manage this profile."); return; }
    if (!r.ok || !d.ok) { setMessage(d.error || "Unable to send verification code"); return; }
    setChallengeId(d.challengeId);
    setMessage(`If this ${d.destinationType === "phone" ? "number" : "email address"} can be used, a verification code is on the way.` + (d.debugCode ? ` Debug code: ${d.debugCode}` : ""));
  }

  async function verify() {
    setWorking(true); setMessage("");
    const r = await fetch("/api/auth/otp", {
      method:"POST", headers:{"content-type":"application/json"},
      body:JSON.stringify({ action:"verify",challengeId,code })
    });
    const d = await r.json().catch(()=>({}));
    setWorking(false);
    if (!r.ok) { setMessage(d.error || "Verification failed"); return; }
    window.location.href = "/app";
  }

  const input = { width:"100%",padding:"12px 14px",border:"1px solid #cbd5e1",borderRadius:10,fontSize:16,boxSizing:"border-box" as const };
  const button = { width:"100%",padding:"12px 14px",border:0,borderRadius:10,fontSize:16,fontWeight:800,cursor:"pointer",background:"#101b33",color:"white" } as const;

  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"#f8fafc",fontFamily:"system-ui,sans-serif"}}>
    <section style={{width:"100%",maxWidth:460,background:"white",padding:28,borderRadius:22,boxShadow:"0 14px 50px rgba(15,23,42,.10)"}}>
      <div style={{fontSize:13,fontWeight:900,letterSpacing:1,color:"#64748b"}}>BANDWAGON</div>
      <h1 style={{fontSize:34,margin:"8px 0 6px"}}>{mode==="create_account"?"Create account":"Sign in"}</h1>
      <p style={{margin:"0 0 24px",color:"#475569"}}>Use your email address or mobile number. No password to remember.</p>

      {!challengeId ? <>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:18}}>
          <button type="button" aria-pressed={mode==="sign_in"} onClick={()=>{setMode("sign_in");setMessage("");}} style={{padding:10,borderRadius:9,border:"1px solid #cbd5e1",background:mode==="sign_in"?"#101b33":"white",color:mode==="sign_in"?"white":"#334155",fontWeight:800,cursor:"pointer"}}>Sign in</button>
          <button type="button" aria-pressed={mode==="create_account"} onClick={()=>{setMode("create_account");setMessage("");}} style={{padding:10,borderRadius:9,border:"1px solid #cbd5e1",background:mode==="create_account"?"#101b33":"white",color:mode==="create_account"?"white":"#334155",fontWeight:800,cursor:"pointer"}}>Create account</button>
        </div>
        <label style={{fontWeight:700}}>Email or mobile number</label>
        <input value={identifier} onChange={e=>setIdentifier(e.target.value)} placeholder="you@example.com or +14695551212" style={{...input,margin:"7px 0 16px"}} />
        {mode==="create_account" && <div style={{padding:16,background:"#f8fafc",borderRadius:14,marginBottom:16}}>
          <div style={{fontWeight:800,marginBottom:10}}>Create your BandWagon account</div>
          <label style={{fontWeight:700}}>Your name</label>
          <input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Harrison Ward" style={{...input,margin:"7px 0 14px"}} />
          <label style={{fontWeight:700}}>Birth month and year</label>
          <div style={{display:"grid",gridTemplateColumns:"1.4fr 1fr",gap:8,margin:"7px 0 14px"}}>
            <select value={birthMonth} onChange={e=>setBirthMonth(e.target.value)} style={input}>
              <option value="">Month</option>{months.map((m,i)=><option key={m} value={i+1}>{m}</option>)}
            </select>
            <input inputMode="numeric" maxLength={4} value={birthYear} onChange={e=>setBirthYear(e.target.value.replace(/\D/g,""))} placeholder="Year" style={input}/>
          </div>
          <p style={{fontSize:12,color:"#64748b",margin:"-5px 0 14px",lineHeight:1.5}}>Direct accounts are for ages 13+. We ask only for month and year. Younger students can be added by a parent or guardian as a managed profile.</p>
          <label style={{fontWeight:700}}>Household name <span style={{fontWeight:400,color:"#64748b"}}>(optional)</span></label>
          <input value={householdName} onChange={e=>setHouseholdName(e.target.value)} placeholder="Ward Family" style={{...input,marginTop:7}} />
        </div>}
        <button disabled={working || !identifier || (mode==="create_account" && (!displayName || !birthMonth || birthYear.length!==4))} onClick={requestCode} style={{...button,opacity:working ? .65 : 1}}>{working ? "Sending…" : "Send verification code"}</button>
      </> : <>
        <label style={{fontWeight:700}}>6-digit verification code</label>
        <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,""))} placeholder="123456" style={{...input,margin:"7px 0 16px",fontSize:24,letterSpacing:6,textAlign:"center"}} />
        <button disabled={working || code.length!==6} onClick={verify} style={{...button,opacity:working ? .65 : 1}}>{working ? "Checking…" : "Continue"}</button>
        <button onClick={()=>{setChallengeId("");setCode("");setMessage("");}} style={{width:"100%",marginTop:10,padding:10,border:0,background:"transparent",cursor:"pointer"}}>Use a different email or number</button>
      </>}

      {message && <div style={{marginTop:18,padding:13,borderRadius:10,background:"#eef2ff",color:"#1e293b"}}>{message}</div>}
      <p style={{fontSize:12,color:"#64748b",marginTop:22,lineHeight:1.5}}>BandWagon uses verification codes only for account access and ride-related communications. It does not sell contact information or use it for marketing.</p>
    </section>
  </main>;
}
