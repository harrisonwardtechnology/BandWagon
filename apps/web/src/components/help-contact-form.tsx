"use client";

import { useState } from "react";
import TurnstileWidget from "@/components/turnstile-widget";

const inputStyle={width:"100%",padding:11,border:"1px solid #cbd5e1",borderRadius:9,boxSizing:"border-box" as const,marginTop:5,font:"inherit"};

export default function HelpContactForm(){
  const siteKey=process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY||"";
  const[token,setToken]=useState("");const[resetKey,setResetKey]=useState(0);const[working,setWorking]=useState(false);const[message,setMessage]=useState("");const[success,setSuccess]=useState(false);
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();setMessage("");setSuccess(false);
    if(!token){setMessage("Please complete the security check.");return;}
    setWorking(true);
    try{
      const form=new FormData(event.currentTarget);const response=await fetch("/api/help/contact",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(Object.fromEntries(form.entries()))});
      const data=await response.json().catch(()=>({error:"Unable to read the support response"}));
      if(!response.ok){setMessage(data.error||"Unable to send your message.");return;}
      event.currentTarget.reset();setSuccess(true);setMessage("Your message was sent to BandWagon Support.");
    }catch{setMessage("Unable to connect to support. Please try again.");}
    finally{setWorking(false);setToken("");setResetKey(x=>x+1);}
  }
  if(!siteKey)return <p><strong>Online contact is temporarily unavailable.</strong> Please use the support email published by your organization.</p>;
  return <>
    <form onSubmit={submit} style={{display:"grid",gap:13}}>
      <div style={{position:"absolute",left:"-10000px"}} aria-hidden="true"><label>Website<input name="companyWebsite" tabIndex={-1} autoComplete="off"/></label></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}>
        <label><strong>Name</strong><input name="name" required minLength={2} maxLength={100} autoComplete="name" style={inputStyle}/></label>
        <label><strong>Email</strong><input name="email" type="email" required maxLength={320} autoComplete="email" style={inputStyle}/></label>
      </div>
      <label><strong>What do you need help with?</strong><select name="topic" required defaultValue="technical" style={inputStyle}><option value="technical">Technical problem</option><option value="account">Account or sign-in</option><option value="organization">Organization setup</option><option value="ride">Ride or event question</option><option value="privacy">Privacy request</option><option value="other">Other</option></select></label>
      <label><strong>Message</strong><textarea name="message" required minLength={10} maxLength={5000} rows={7} style={{...inputStyle,resize:"vertical"}} placeholder="Tell us what happened and what you expected. Do not include passwords, one-time codes, payment-card details, or sensitive documents."/></label>
      <TurnstileWidget action="support_contact" onToken={setToken} resetKey={resetKey}/><input type="hidden" name="turnstileToken" value={token}/>
      <button disabled={working||!token} style={{justifySelf:"start",padding:"12px 18px",border:0,borderRadius:10,background:"#2458d8",color:"white",fontWeight:900,cursor:"pointer"}}>{working?"Sending…":"Send to BandWagon Support"}</button>
      {message&&<div role="status" aria-live="polite" style={{padding:12,borderRadius:10,background:success?"#ecfdf5":"#fff7ed",color:success?"#166534":"#9a3412"}}>{message}</div>}
    </form>
  </>;
}
