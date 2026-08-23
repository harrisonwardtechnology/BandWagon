"use client";

import { useState } from "react";

export default function SecurityPage(){
  const [form,setForm]=useState({reportType:"security",severity:"unknown",title:"",description:"",reproductionSteps:"",affectedUrl:"",contactEmail:"",secureEvidenceUrl:"",safeHarborAcknowledged:false,companyWebsite:""});
  const [message,setMessage]=useState("");
  const [trackingId,setTrackingId]=useState("");
  const input={display:"block",width:"100%",padding:12,margin:"7px 0 14px",border:"1px solid #cbd5e1",borderRadius:9,boxSizing:"border-box"} as const;
  const card={background:"#fff",border:"1px solid #dbe3ef",borderRadius:18,padding:22,marginTop:18} as const;
  async function submit(){setMessage("Submitting...");setTrackingId("");const r=await fetch("/api/security/report",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(form)});const d=await r.json().catch(()=>({}));if(!r.ok){setMessage(d.error||"Unable to submit report");return;}setTrackingId(d.trackingId||"");setMessage("Report received. Thank you for helping keep BandWagon safe.");}
  return <main style={{maxWidth:920,margin:"36px auto",padding:"0 20px",fontFamily:"system-ui,sans-serif"}}>
    <section style={{background:"#101b33",color:"white",padding:30,borderRadius:22}}><div style={{fontSize:13,fontWeight:900,letterSpacing:1}}>SECURITY & RESPONSIBLE DISCLOSURE</div><h1 style={{fontSize:40,margin:"6px 0"}}>Help us keep BandWagon safe</h1><p style={{fontSize:17,lineHeight:1.6,marginBottom:0}}>We welcome good-faith security, privacy and safety reports. BandWagon is designed around families and minors, so careful handling of sensitive information matters as much as fixing the bug itself.</p></section>

    <section style={card}><h2 style={{marginTop:0}}>Bug Bounty & Safe Harbor</h2><p>Good-faith research performed to improve BandWagon security is welcome when it avoids harm, privacy invasion, service disruption, social engineering and access to data beyond what is necessary to demonstrate the issue. Eligible reports may receive a bounty or recognition based on severity, exploitability, impact, quality of the report and whether the issue was previously known. A bounty is not guaranteed until BandWagon accepts the report as eligible.</p><p><strong>Do not publicly disclose an unresolved vulnerability or include real private information about users or minors in a public issue.</strong> Give us a reasonable opportunity to investigate and remediate first.</p></section>

    <section style={{...card,background:"#f8fafc"}}><h2 style={{marginTop:0}}>Sensitive evidence</h2><p>Do not paste passwords, tokens, one-time codes, identity documents, private information about minors, or other sensitive evidence into this form or ordinary email.</p><p>Use <a href="https://secret.harrisonward.com" target="_blank" rel="noreferrer"><strong>secret.harrisonward.com</strong></a> to send sensitive material, then paste only the secure-share reference/link below. The BandWagon report stores that reference, not the sensitive contents.</p></section>

    <section style={card}><h2 style={{marginTop:0}}>Report an Issue</h2>
      <label>Report type</label><select value={form.reportType} onChange={e=>setForm({...form,reportType:e.target.value})} style={input}><option value="security">Security vulnerability</option><option value="privacy">Privacy issue</option><option value="safety">Safety issue</option><option value="bug">Product bug with security impact</option></select>
      <label>Estimated severity</label><select value={form.severity} onChange={e=>setForm({...form,severity:e.target.value})} style={input}><option value="unknown">Not sure</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select>
      <label>Title</label><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} style={input} placeholder="Short description of the issue"/>
      <label>What happened?</label><textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} style={{...input,minHeight:150}} placeholder="Describe the issue, impact and what you observed."/>
      <label>Steps to reproduce</label><textarea value={form.reproductionSteps} onChange={e=>setForm({...form,reproductionSteps:e.target.value})} style={{...input,minHeight:120}} placeholder="Use test data whenever possible."/>
      <label>Affected URL or area</label><input value={form.affectedUrl} onChange={e=>setForm({...form,affectedUrl:e.target.value})} style={input} placeholder="https://... or feature name"/>
      <label>Contact email</label><input type="email" value={form.contactEmail} onChange={e=>setForm({...form,contactEmail:e.target.value})} style={input} placeholder="you@example.com"/>
      <label>Secure Evidence Reference <span style={{color:"#64748b"}}>(optional)</span></label><input value={form.secureEvidenceUrl} onChange={e=>setForm({...form,secureEvidenceUrl:e.target.value})} style={input} placeholder="https://secret.harrisonward.com/..."/>
      <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.companyWebsite} onChange={e=>setForm({...form,companyWebsite:e.target.value})} style={{display:"none"}}/>
      <label style={{display:"flex",gap:10,alignItems:"flex-start",margin:"12px 0 18px"}}><input type="checkbox" checked={form.safeHarborAcknowledged} onChange={e=>setForm({...form,safeHarborAcknowledged:e.target.checked})}/><span>I will follow the responsible disclosure rules above and avoid unnecessary access to other people’s data.</span></label>
      <button onClick={submit} style={{background:"#101b33",color:"white",border:0,borderRadius:10,padding:"12px 18px",fontWeight:800,cursor:"pointer"}}>Submit Security Report</button>
      {message&&<p style={{marginTop:16,fontWeight:700}}>{message}</p>}{trackingId&&<p style={{padding:14,background:"#ecfdf5",borderRadius:10}}>Tracking ID: <strong>{trackingId}</strong>. Save this number for follow-up.</p>}
    </section>
  </main>;
}
