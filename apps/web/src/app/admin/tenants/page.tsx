"use client";

import { useState } from "react";

export default function TenantsAdmin() {
  const [organizations,setOrganizations]=useState<any[]>([]);
  const [domainSetup,setDomainSetup]=useState<any>({automaticAvailable:false,manualAvailable:true});
  const [name,setName]=useState("FloMoGo");
  const [slug,setSlug]=useState("flomogo");
  const [selectedOrg,setSelectedOrg]=useState("");
  const [customDomain,setCustomDomain]=useState("flomogo.app");
  const [setupMode,setSetupMode]=useState<"automatic"|"manual">("automatic");
  const [message,setMessage]=useState("");
  const [result,setResult]=useState<any>(null);
  const [baseDomain,setBaseDomain]=useState("");

  const headers={"content-type":"application/json"};
  const input={display:"block",width:"100%",padding:12,margin:"8px 0 14px",border:"1px solid var(--line-strong)",borderRadius:8} as const;
  const card={marginTop:20,padding:20,border:"1px solid var(--line-2)",borderRadius:16} as const;

  async function refresh(){
    setMessage("");
    const r=await fetch("/api/admin/tenants");
    const d=await r.json().catch(()=>({}));
    if(!r.ok)return setMessage(d.error||"Unable to load organizations");
    setOrganizations(d.organizations||[]);if(d.tenantBaseDomain)setBaseDomain(d.tenantBaseDomain);setDomainSetup(d.domainSetup||{automaticAvailable:false,manualAvailable:true});
    if(!d.domainSetup?.automaticAvailable)setSetupMode("manual");
    if(!selectedOrg && d.organizations?.[0]?.id)setSelectedOrg(d.organizations[0].id);
  }

  async function act(body:any){
    setMessage("Working..."); setResult(null);
    const r=await fetch("/api/admin/tenants",{method:"POST",headers,body:JSON.stringify(body)});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){setMessage(d.error||"Tenant operation failed");return null;}
    setResult(d); setMessage("Done."); await refresh(); return d;
  }

  return <main style={{maxWidth:1050,margin:"40px auto",padding:"0 20px",fontFamily:"system-ui,sans-serif"}}>
    <section style={{background:"var(--panel-solid)",color:"white",padding:28,borderRadius:22}}>
      <div style={{fontSize:13,fontWeight:800,letterSpacing:1}}>PLATFORM ADMIN</div>
      <h1 style={{fontSize:38,margin:"6px 0"}}>SaaS Tenants</h1>
      <p style={{margin:0,opacity:.9}}>Every organization gets <strong>tenant.{baseDomain||"<tenant base domain>"}</strong>, with an optional custom domain.</p>
      <p style={{margin:"10px 0 0"}}><a href="/admin/organization-requests" style={{color:"white",fontWeight:800}}>Review Community Requests</a></p>
    </section>

    <section style={card}>
      <p><strong>Platform owner access required.</strong> Tenant administration uses your signed-in session.</p>
      <button onClick={refresh}>Refresh Organizations</button>
      <p style={{marginBottom:0}}><a href="/admin/usage">Texting And AI Usage By Organization</a> · adjust each organization&apos;s monthly texting allowance.</p>
    </section>

    <section style={card}>
      <h2>Create Organization</h2>
      <label>Name</label><input value={name} onChange={e=>setName(e.target.value)} style={input}/>
      <label>Tenant Slug</label><input value={slug} onChange={e=>setSlug(e.target.value)} style={input}/>
      <p>Default URL: <code>{slug||"tenant"}.{baseDomain||"<tenant base domain>"}</code></p>
      <button onClick={()=>act({action:"create",name,slug})}>Create Tenant</button>
    </section>

    {organizations.length>0&&<section style={card}>
      <h2>Organizations</h2>
      {organizations.map(org=><div key={org.id} style={{padding:"14px 0",borderBottom:"1px solid var(--line-soft)"}}>
        <strong>{org.display_name||org.name}</strong> · <code>{org.tenant_hostname}</code> · {org.status}
        <div style={{fontSize:14,color:"var(--text-3)",marginTop:6}}>{org.id}</div>
        <ul>{(org.domains||[]).map((d:any)=><li key={d.id}><code>{d.hostname}</code> — {d.domainType} — {d.status} — DNS {d.dnsStatus||"n/a"} — SSL {d.sslStatus||"n/a"}{d.isPrimary?" — PRIMARY":""}</li>)}</ul>
      </div>)}
    </section>}

    <section style={card}>
      <h2>Connect A Custom Domain</h2>
      <p style={{color:"var(--text-3)"}}>Choose the easiest setup for the person who manages the domain. You can switch to manual setup at any time.</p>
      <label>Organization</label>
      <select value={selectedOrg} onChange={e=>setSelectedOrg(e.target.value)} style={input}>
        <option value="">Select Organization</option>
        {organizations.map(org=><option key={org.id} value={org.id}>{org.display_name||org.name}</option>)}
      </select>
      <label>Customer Hostname</label>
      <input value={customDomain} onChange={e=>setCustomDomain(e.target.value)} style={input}/>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:12,margin:"16px 0"}}>
        <button type="button" disabled={!domainSetup.automaticAvailable} onClick={()=>setSetupMode("automatic")} style={{textAlign:"left",padding:18,borderRadius:14,border:setupMode==="automatic"?"2px solid var(--line-solid)":"1px solid var(--line-strong)",background:setupMode==="automatic"?"var(--surface-3)":"var(--surface)",opacity:domainSetup.automaticAvailable?1:.55}}>
          <strong>Automatic Setup — Recommended</strong><div style={{fontSize:14,color:"var(--text-3)",marginTop:6}}>{domainSetup.automaticAvailable?"We detect the DNS provider and automate or guide the connection through DoDomain.":"Automatic setup is not configured yet."}</div>
        </button>
        <button type="button" onClick={()=>setSetupMode("manual")} style={{textAlign:"left",padding:18,borderRadius:14,border:setupMode==="manual"?"2px solid var(--line-solid)":"1px solid var(--line-strong)",background:setupMode==="manual"?"var(--surface-3)":"var(--surface)"}}>
          <strong>Manual Setup</strong><div style={{fontSize:14,color:"var(--text-3)",marginTop:6}}>Show the exact DNS record, copy buttons, provider hints, and let BandWagon check it.</div>
        </button>
      </div>

      <button disabled={!selectedOrg} onClick={()=>act({action:"request-domain",organizationId:selectedOrg,hostname:customDomain,setupMode})}>{setupMode==="automatic"?"Start Automatic Setup":"Generate Manual DNS Setup"}</button>

      {result?.automatic?.available&&<div style={{marginTop:16,padding:18,background:"var(--bg-success)",border:"1px solid var(--line-success)",borderRadius:12}}>
        <strong>Automatic setup is ready</strong>
        <p>DNS provider: <strong>{result.automatic.inspection?.provider||"Detected during setup"}</strong></p>
        <a href={result.automatic.connectUrl} target="_blank" rel="noreferrer" style={{display:"inline-block",padding:"10px 14px",background:"var(--btn-solid)",color:"var(--on-btn-solid)",borderRadius:8,textDecoration:"none"}}>Continue Domain Setup</a>
        <button style={{marginLeft:10}} onClick={()=>setSetupMode("manual")}>Use Manual Setup Instead</button>
      </div>}

      {result?.automatic&&!result.automatic.available&&<div style={{marginTop:16,padding:18,background:"var(--bg-warn)",border:"1px solid var(--line-warn)",borderRadius:12}}>
        <strong>Manual setup is needed for this domain</strong>
        <p>{result.automatic.reason}</p>
        <button onClick={()=>setSetupMode("manual")}>Switch To Manual Setup</button>
      </div>}

      {result?.cname&&(!result?.automatic?.available||setupMode==="manual")&&<div style={{marginTop:16,padding:14,background:"var(--surface-2)",borderRadius:10}}>
        <strong>Customer DNS Record</strong>
        <p>Type: <code>CNAME</code></p>
        <p>Name: <code>{result.cname.name}</code> <button onClick={()=>navigator.clipboard?.writeText(result.cname.name)}>Copy</button></p>
        <p>Target: <code>{result.cname.target}</code> <button onClick={()=>navigator.clipboard?.writeText(result.cname.target)}>Copy</button></p>
        <p>Cloudflare SaaS provisioned: <strong>{result.cloudflareProvisioned?"Yes":"Not configured yet"}</strong></p>
        {result.domain?.id&&<button onClick={()=>act({action:"verify-domain",domainId:result.domain.id})}>I Added It — Check DNS</button>}
      </div>}
    </section>

    {message&&<p style={{padding:14,background:"var(--surface-2)",borderRadius:10}}>{message}</p>}
  </main>;
}
