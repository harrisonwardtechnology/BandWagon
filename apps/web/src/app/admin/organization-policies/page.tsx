"use client";

import { useEffect, useState } from "react";

type Row = Record<string, any>;

export default function OrganizationPoliciesAdmin() {
  const [organizations,setOrganizations]=useState<Row[]>([]);
  const [organizationId,setOrganizationId]=useState("");
  const [status,setStatus]=useState<Row|null>(null);
  const [authorityConfirmed,setAuthorityConfirmed]=useState(false);
  const [policiesReviewed,setPoliciesReviewed]=useState(false);
  const [confirmation,setConfirmation]=useState("");
  const [message,setMessage]=useState("");
  const [working,setWorking]=useState(false);

  async function load(id=organizationId) {
    const suffix=id?`?organizationId=${encodeURIComponent(id)}`:"";
    const response=await fetch(`/api/admin/organization-policies${suffix}`,{cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){setMessage(data.error||"Unable to load policy status");return;}
    setOrganizations(data.organizations||[]);
    if(!id&&data.organizations?.[0]){setOrganizationId(data.organizations[0].id);void load(data.organizations[0].id);return;}
    setStatus(data.status||null);setMessage("");
  }

  useEffect(()=>{void load("");},[]);

  async function accept() {
    if(!organizationId||!status)return;
    setWorking(true);setMessage("");
    const response=await fetch("/api/admin/organization-policies",{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({action:"accept",organizationId,authorityConfirmed,policiesReviewed,confirmation}),
    });
    const data=await response.json().catch(()=>({}));setWorking(false);
    if(!response.ok){setMessage(data.error||"Unable to accept policies");return;}
    setMessage("Current Terms of Use and Privacy Policy accepted for this organization. The acknowledgement is now in the audit history.");
    setAuthorityConfirmed(false);setPoliciesReviewed(false);setConfirmation("");await load(organizationId);
  }

  const card={background:"white",border:"1px solid #e2e8f0",borderRadius:16,padding:20} as const;
  return <main style={{maxWidth:920,margin:"36px auto",padding:"0 20px",fontFamily:"system-ui,sans-serif",background:"#f8fafc"}}>
    <header style={{background:"#101b33",color:"white",padding:28,borderRadius:22,marginBottom:18}}><div style={{fontSize:13,fontWeight:900,letterSpacing:1}}>ORGANIZATION ADMIN</div><h1 style={{margin:"6px 0"}}>Terms &amp; Privacy Acknowledgement</h1><p style={{marginBottom:0,opacity:.9,lineHeight:1.55}}>An authorized organization owner must review and accept the current BandWagon policies. Each version is retained as an auditable record.</p></header>
    <section style={{...card,marginBottom:16}}><label><strong>Organization</strong><select value={organizationId} onChange={e=>{setOrganizationId(e.target.value);void load(e.target.value);}} style={{display:"block",width:"100%",marginTop:6,padding:10,border:"1px solid #cbd5e1",borderRadius:9}}><option value="">Select organization</option>{organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label></section>
    {status&&<><section style={{...card,marginBottom:16,borderColor:status.current?"#86efac":"#fbbf24"}}><h2 style={{marginTop:0}}>Current requirement</h2><p>Terms version: <strong>{status.currentVersions.terms}</strong><br/>Privacy version: <strong>{status.currentVersions.privacy}</strong></p>{status.current?<p style={{color:"#166534",fontWeight:850}}>Accepted {new Date(status.current.acknowledged_at).toLocaleString()} by {status.current.acknowledged_by||"a former organization owner"}.</p>:<p style={{color:"#92400e",fontWeight:850}}>The current policy versions have not been accepted for this organization.</p>}<p><a href="/terms" target="_blank" rel="noreferrer">Review Terms of Use</a> · <a href="/privacy" target="_blank" rel="noreferrer">Review Privacy Policy</a></p></section>
    {!status.current&&<section style={{...card,marginBottom:16,opacity:status.canAccept?1:.7}}><h2 style={{marginTop:0}}>Accept for {status.organization.name}</h2>{!status.canAccept?<p><strong>Only an organization owner can complete this acknowledgement.</strong> Administrators and managers may review the status but cannot bind the organization.</p>:<><label style={{display:"flex",gap:10,margin:"12px 0"}}><input type="checkbox" checked={policiesReviewed} onChange={e=>setPoliciesReviewed(e.target.checked)}/><span>I reviewed the current Terms of Use and Privacy Policy.</span></label><label style={{display:"flex",gap:10,margin:"12px 0"}}><input type="checkbox" checked={authorityConfirmed} onChange={e=>setAuthorityConfirmed(e.target.checked)}/><span>I confirm that I am authorized to accept these policies for this organization.</span></label><label><strong>Type {status.confirmationPhrase} exactly</strong><input value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="off" style={{display:"block",width:"100%",boxSizing:"border-box",margin:"7px 0 14px",padding:11,border:"1px solid #cbd5e1",borderRadius:9}}/></label><button disabled={working||!policiesReviewed||!authorityConfirmed||confirmation!==status.confirmationPhrase} onClick={()=>void accept()} style={{padding:"12px 16px",border:0,borderRadius:9,background:"#101b33",color:"white",fontWeight:900,cursor:"pointer"}}>{working?"Recording…":"Accept Current Policies"}</button></>}</section>}
    <section style={card}><h2 style={{marginTop:0}}>Acknowledgement history</h2>{status.history.length===0?<p>No organization policy acknowledgements recorded.</p>:<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:620}}><thead><tr><th style={{textAlign:"left"}}>Accepted</th><th style={{textAlign:"left"}}>Terms</th><th style={{textAlign:"left"}}>Privacy</th><th style={{textAlign:"left"}}>Accepted by</th></tr></thead><tbody>{status.history.map((row:Row)=><tr key={row.id} style={{borderTop:"1px solid #e2e8f0"}}><td style={{padding:"10px 4px"}}>{new Date(row.acknowledged_at).toLocaleString()}</td><td>{row.terms_version}</td><td>{row.privacy_version}</td><td>{row.acknowledged_by||"Former owner"}</td></tr>)}</tbody></table></div>}</section></>}
    {message&&<p style={{padding:14,background:"#eef2ff",borderRadius:12,fontWeight:750}}>{message}</p>}<p><a href="/admin/operations">← Operations Dashboard</a></p>
  </main>;
}
