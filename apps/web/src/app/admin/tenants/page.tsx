"use client";

import { useState } from "react";

export default function TenantsAdmin() {
  const [token,setToken]=useState("");
  const [organizations,setOrganizations]=useState<any[]>([]);
  const [name,setName]=useState("FloMoGo");
  const [slug,setSlug]=useState("flomogo");
  const [selectedOrg,setSelectedOrg]=useState("");
  const [customDomain,setCustomDomain]=useState("flomogo.app");
  const [message,setMessage]=useState("");
  const [result,setResult]=useState<any>(null);

  const headers=()=>({"content-type":"application/json","x-bandwagon-admin-token":token});
  const input={display:"block",width:"100%",padding:12,margin:"8px 0 14px",border:"1px solid #cbd5e1",borderRadius:8} as const;
  const card={marginTop:20,padding:20,border:"1px solid #dbe3ef",borderRadius:16} as const;

  async function refresh(){
    setMessage("");
    const r=await fetch("/api/admin/tenants",{headers:{"x-bandwagon-admin-token":token}});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)return setMessage(d.error||"Unable to load organizations");
    setOrganizations(d.organizations||[]);
    if(!selectedOrg && d.organizations?.[0]?.id)setSelectedOrg(d.organizations[0].id);
  }

  async function act(body:any){
    setMessage("Working..."); setResult(null);
    const r=await fetch("/api/admin/tenants",{method:"POST",headers:headers(),body:JSON.stringify(body)});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){setMessage(d.error||"Tenant operation failed");return null;}
    setResult(d); setMessage("Done."); await refresh(); return d;
  }

  return <main style={{maxWidth:1050,margin:"40px auto",padding:"0 20px",fontFamily:"system-ui,sans-serif"}}>
    <section style={{background:"#101b33",color:"white",padding:28,borderRadius:22}}>
      <div style={{fontSize:13,fontWeight:800,letterSpacing:1}}>PLATFORM ADMIN</div>
      <h1 style={{fontSize:38,margin:"6px 0"}}>SaaS Tenants</h1>
      <p style={{margin:0,opacity:.9}}>Every organization gets <strong>tenant.harrisonward.org</strong>, with an optional custom domain.</p>
    </section>

    <section style={card}>
      <label><strong>Admin Test Token</strong></label>
      <input type="password" value={token} onChange={e=>setToken(e.target.value)} style={input}/>
      <button onClick={refresh}>Refresh Organizations</button>
    </section>

    <section style={card}>
      <h2>Create Organization</h2>
      <label>Name</label><input value={name} onChange={e=>setName(e.target.value)} style={input}/>
      <label>Tenant slug</label><input value={slug} onChange={e=>setSlug(e.target.value)} style={input}/>
      <p>Default URL: <code>{slug||"tenant"}.harrisonward.org</code></p>
      <button onClick={()=>act({action:"create",name,slug})}>Create Tenant</button>
    </section>

    {organizations.length>0&&<section style={card}>
      <h2>Organizations</h2>
      {organizations.map(org=><div key={org.id} style={{padding:"14px 0",borderBottom:"1px solid #eef2f7"}}>
        <strong>{org.display_name||org.name}</strong> · <code>{org.tenant_hostname}</code> · {org.status}
        <div style={{fontSize:14,color:"#475569",marginTop:6}}>{org.id}</div>
        <ul>{(org.domains||[]).map((d:any)=><li key={d.id}><code>{d.hostname}</code> — {d.domainType} — {d.status} — DNS {d.dnsStatus||"n/a"} — SSL {d.sslStatus||"n/a"}{d.isPrimary?" — PRIMARY":""}</li>)}</ul>
      </div>)}
    </section>}

    <section style={card}>
      <h2>Custom Domain</h2>
      <label>Organization</label>
      <select value={selectedOrg} onChange={e=>setSelectedOrg(e.target.value)} style={input}>
        <option value="">Select organization</option>
        {organizations.map(org=><option key={org.id} value={org.id}>{org.display_name||org.name}</option>)}
      </select>
      <label>Customer hostname</label>
      <input value={customDomain} onChange={e=>setCustomDomain(e.target.value)} style={input}/>
      <button disabled={!selectedOrg} onClick={()=>act({action:"request-domain",organizationId:selectedOrg,hostname:customDomain})}>Generate CNAME Setup</button>
      {result?.cname&&<div style={{marginTop:16,padding:14,background:"#f8fafc",borderRadius:10}}>
        <strong>Customer DNS record</strong>
        <p>Type: <code>CNAME</code></p>
        <p>Name: <code>{result.cname.name}</code></p>
        <p>Target: <code>{result.cname.target}</code></p>
        <p>Cloudflare SaaS provisioned: <strong>{result.cloudflareProvisioned?"Yes":"Not configured yet"}</strong></p>
        {result.domain?.id&&<button onClick={()=>act({action:"verify-domain",domainId:result.domain.id})}>Verify Domain</button>}
      </div>}
    </section>

    {message&&<p style={{padding:14,background:"#f8fafc",borderRadius:10}}>{message}</p>}
  </main>;
}
