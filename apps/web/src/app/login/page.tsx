"use client";

import { useEffect, useRef, useState } from "react";
import { browserSupportsWebAuthn, browserSupportsWebAuthnAutofill, startAuthentication } from "@simplewebauthn/browser";
import TurnstileWidget from "@/components/turnstile-widget";
import PhoneNumberInput from "@/components/phone-number-input";
import { SMS_CONSENT_TEXT } from "@/lib/sms-consent-policy";
import { PASSKEY_EXPLAINER, safeNextPath } from "@/lib/passkey-policy";

const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default function LoginPage() {
  const [contactMethod,setContactMethod] = useState<"email"|"phone">("email");
  const [email,setEmail] = useState("");
  const [phone,setPhone] = useState("");
  const [smsConsent,setSmsConsent] = useState(false);
  const [displayName,setDisplayName] = useState("");
  const [householdName,setHouseholdName] = useState("");
  const [birthMonth,setBirthMonth] = useState("");
  const [birthYear,setBirthYear] = useState("");
  const [challengeId,setChallengeId] = useState("");
  const [code,setCode] = useState("");
  const [mode,setMode] = useState<"sign_in"|"create_account">("sign_in");
  const [message,setMessage] = useState("");
  const [working,setWorking] = useState(false);
  const [turnstileToken,setTurnstileToken]=useState("");
  const [turnstileReset,setTurnstileReset]=useState(0);
  const [passkeyReady,setPasskeyReady]=useState(false);
  const autofillStarted=useRef(false);

  function nextPath() {
    return safeNextPath(new URLSearchParams(window.location.search).get("next"));
  }

  useEffect(() => {
    let cancelled=false;
    (async () => {
      if (!browserSupportsWebAuthn()) return;
      const r=await fetch("/api/auth/passkey",{cache:"no-store"}).catch(()=>null);
      const d=r?await r.json().catch(()=>({})):{};
      if (cancelled || !d.enabled) return;
      setPasskeyReady(true);
      // Conditional UI: offer saved passkeys in the email field's autofill list.
      if (!autofillStarted.current && await browserSupportsWebAuthnAutofill().catch(()=>false)) {
        autofillStarted.current=true;
        void signInWithPasskey(true);
      }
    })();
    return () => { cancelled=true; };
  }, []);

  async function signInWithPasskey(autofill=false) {
    let busy=!autofill;
    if (busy) { setWorking(true); setMessage(""); }
    try {
      const o=await fetch("/api/auth/passkey",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"options"})});
      const od=await o.json().catch(()=>({}));
      if (!o.ok || !od.options) { if (!autofill) setMessage(od.error || "Passkey sign-in is not available right now."); return; }
      let assertion;
      try {
        assertion=await startAuthentication({ optionsJSON: od.options, useBrowserAutofill: autofill });
      } catch (error) {
        const name=error instanceof Error ? error.name : "";
        // Starting the button flow cancels the autofill flow. Stay quiet about that.
        if (autofill || name==="AbortError") return;
        setMessage(name==="NotAllowedError" ? "Passkey sign-in was canceled. You can try again or use a code." : "This device could not use a passkey. You can use a code instead.");
        return;
      }
      busy=true;
      setWorking(true);
      const v=await fetch("/api/auth/passkey",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"verify",response:assertion})});
      const vd=await v.json().catch(()=>({}));
      if (!v.ok) { setMessage(vd.error || "We could not sign you in with that passkey."); return; }
      window.location.href=nextPath();
    } finally {
      if (busy) setWorking(false);
    }
  }

  async function requestCode() {
    setWorking(true); setMessage("");
    const identifier=contactMethod==="email"?email.trim():phone;
    const r = await fetch("/api/auth/otp", {
      method:"POST", headers:{"content-type":"application/json"},
      body:JSON.stringify({
        action:"request",identifier,displayName:displayName||null,householdName:householdName||null,
        birthMonth:birthMonth||null,birthYear:birthYear||null,
        signupIntent:mode==="create_account",turnstileToken,
      })
    });
    const d = await r.json().catch(()=>({}));
    setWorking(false);setTurnstileToken("");setTurnstileReset(x=>x+1);
    if (d.underAge) { setMessage(d.message || "A parent or guardian must manage this profile."); return; }
    if (!r.ok || !d.ok) { setMessage(d.error || "Unable to send verification code"); return; }
    setChallengeId(d.challengeId);
    setMessage(`If this ${d.destinationType === "phone" ? "number" : "email address"} can be used, a verification code is on the way.` + (d.debugCode ? ` Debug code: ${d.debugCode}` : ""));
  }

  async function verify() {
    setWorking(true); setMessage("");
    const r = await fetch("/api/auth/otp", {
      method:"POST", headers:{"content-type":"application/json"},
      body:JSON.stringify({ action:"verify",challengeId,code,smsConsent:contactMethod==="phone"&&smsConsent })
    });
    const d = await r.json().catch(()=>({}));
    setWorking(false);
    if (!r.ok) { setMessage(d.error || "Verification failed"); return; }
    window.location.href = nextPath();
  }

  const input = { width:"100%",padding:"12px 14px",border:"1px solid #cbd5e1",borderRadius:10,fontSize:16,boxSizing:"border-box" as const };
  const button = { width:"100%",padding:"12px 14px",border:0,borderRadius:10,fontSize:16,fontWeight:800,cursor:"pointer",background:"#101b33",color:"white" } as const;

  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"#f8fafc",fontFamily:"system-ui,sans-serif"}}>
    <section style={{width:"100%",maxWidth:460,background:"white",padding:28,borderRadius:22,boxShadow:"0 14px 50px rgba(15,23,42,.10)"}}>
      <div style={{fontSize:13,fontWeight:900,letterSpacing:1,color:"#64748b"}}>BANDWAGON</div>
      <h1 style={{fontSize:34,margin:"8px 0 6px"}}>{mode==="create_account"?"Create Account":"Sign In"}</h1>
      <p style={{margin:"0 0 24px",color:"#475569"}}>Use your email address or mobile number. No password to remember.</p>

      {!challengeId ? <>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:18}}>
          <button type="button" aria-pressed={mode==="sign_in"} onClick={()=>{setMode("sign_in");setMessage("");}} style={{padding:10,borderRadius:9,border:"1px solid #cbd5e1",background:mode==="sign_in"?"#101b33":"white",color:mode==="sign_in"?"white":"#334155",fontWeight:800,cursor:"pointer"}}>Sign In</button>
          <button type="button" aria-pressed={mode==="create_account"} onClick={()=>{setMode("create_account");setMessage("");}} style={{padding:10,borderRadius:9,border:"1px solid #cbd5e1",background:mode==="create_account"?"#101b33":"white",color:mode==="create_account"?"white":"#334155",fontWeight:800,cursor:"pointer"}}>Create Account</button>
        </div>
        {mode==="sign_in" && passkeyReady && <div style={{marginBottom:18}}>
          <button type="button" disabled={working} onClick={()=>void signInWithPasskey(false)} style={{...button,background:"white",color:"#101b33",border:"2px solid #101b33",opacity:working ? .65 : 1}}>Sign In With A Passkey</button>
          <p style={{fontSize:13,color:"#64748b",margin:"8px 0 0",textAlign:"center"}}>{PASSKEY_EXPLAINER}</p>
          <div role="separator" style={{display:"flex",alignItems:"center",gap:10,margin:"16px 0 0",color:"#94a3b8",fontSize:13}}><span style={{flex:1,height:1,background:"#e2e8f0"}}/>Or Get A Code<span style={{flex:1,height:1,background:"#e2e8f0"}}/></div>
        </div>}
        <fieldset style={{border:0,padding:0,margin:"0 0 16px"}}>
          <legend style={{fontWeight:700,marginBottom:7}}>How should we send your code?</legend>
          <div className="contact-method-tabs">
            <button type="button" aria-pressed={contactMethod==="email"} onClick={()=>{setContactMethod("email");setMessage("");}}>Email</button>
            <button type="button" aria-pressed={contactMethod==="phone"} onClick={()=>{setContactMethod("phone");setMessage("");}}>Mobile Phone</button>
          </div>
        </fieldset>
        {contactMethod==="email" ? <>
          <label htmlFor="login-email" style={{fontWeight:700}}>Email Address</label>
          <input id="login-email" type="email" autoComplete="username webauthn" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" style={{...input,margin:"7px 0 16px"}} />
        </> : <>
          <label htmlFor="login-phone" style={{display:"block",fontWeight:700,marginBottom:7}}>Mobile Number</label>
          <PhoneNumberInput id="login-phone" value={phone} onChange={setPhone} required />
          <label style={{display:"flex",gap:10,alignItems:"flex-start",margin:"12px 0 16px",fontSize:13,lineHeight:1.5,color:"#334155"}}>
            <input type="checkbox" checked={smsConsent} onChange={e=>setSmsConsent(e.target.checked)} style={{marginTop:3,flex:"0 0 auto"}} />
            <span>{SMS_CONSENT_TEXT} <span style={{color:"#64748b"}}>Optional. Your sign-in code is sent either way. See our <a href="/terms">Terms of Use</a>, <a href="/privacy">Privacy Policy</a> and <a href="/sms-opt-in">Messaging and SMS Consent</a>.</span></span>
          </label>
        </>}
        {mode==="create_account" && <div style={{padding:16,background:"#f8fafc",borderRadius:14,marginBottom:16}}>
          <div style={{fontWeight:800,marginBottom:10}}>Create Your BandWagon Account</div>
          <label style={{fontWeight:700}}>Your Name</label>
          <input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Harrison Ward" style={{...input,margin:"7px 0 14px"}} />
          <label style={{fontWeight:700}}>Birth Month And Year</label>
          <div style={{display:"grid",gridTemplateColumns:"1.4fr 1fr",gap:8,margin:"7px 0 14px"}}>
            <select value={birthMonth} onChange={e=>setBirthMonth(e.target.value)} style={input}>
              <option value="">Month</option>{months.map((m,i)=><option key={m} value={i+1}>{m}</option>)}
            </select>
            <input inputMode="numeric" maxLength={4} value={birthYear} onChange={e=>setBirthYear(e.target.value.replace(/\D/g,""))} placeholder="Year" style={input}/>
          </div>
          <p style={{fontSize:12,color:"#64748b",margin:"-5px 0 14px",lineHeight:1.5}}>Direct accounts are for ages 13+. We ask only for month and year. Younger students can be added by a parent or guardian as a managed profile.</p>
          <label style={{fontWeight:700}}>Household Name <span style={{fontWeight:400,color:"#64748b"}}>(Optional)</span></label>
          <input value={householdName} onChange={e=>setHouseholdName(e.target.value)} placeholder="Ward Family" style={{...input,marginTop:7}} />
        </div>}
        <TurnstileWidget action="otp_request" onToken={setTurnstileToken} resetKey={turnstileReset}/>
        <button disabled={working || !turnstileToken || !(contactMethod==="email"?email.trim():phone) || (mode==="create_account" && (!displayName || !birthMonth || birthYear.length!==4))} onClick={requestCode} style={{...button,opacity:working ? .65 : 1}}>{working ? "Sending…" : "Send Verification Code"}</button>
      </> : <>
        <label style={{fontWeight:700}}>6-Digit Verification Code</label>
        <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,""))} placeholder="123456" style={{...input,margin:"7px 0 16px",fontSize:24,letterSpacing:6,textAlign:"center"}} />
        <button disabled={working || code.length!==6} onClick={verify} style={{...button,opacity:working ? .65 : 1}}>{working ? "Checking…" : "Continue"}</button>
        <button onClick={()=>{setChallengeId("");setCode("");setMessage("");}} style={{width:"100%",marginTop:10,padding:10,border:0,background:"transparent",cursor:"pointer"}}>Use A Different Email Or Number</button>
      </>}

      {message && <div style={{marginTop:18,padding:13,borderRadius:10,background:"#eef2ff",color:"#1e293b"}}>{message}</div>}
      <p style={{fontSize:12,color:"#64748b",marginTop:22,lineHeight:1.5}}>BandWagon uses verification codes only for account access and ride-related communications. It does not sell contact information or use it for marketing.</p>
    </section>
  </main>;
}
