"use client";

import { useEffect,useState } from "react";
import { AppNav,appCardStyle,appPageStyle } from "@/components/app-nav";

type Row=Record<string,any>;
const labels:Record<string,string>={driver_license:"Driver License",insurance:"Insurance",volunteer_approval:"Volunteer Approval",other:"Other"};

export default function CredentialsPage(){
  const [documents,setDocuments]=useState<Row[]>([]);const [safety,setSafety]=useState<Row[]>([]);const [reviewOrg,setReviewOrg]=useState("");const [message,setMessage]=useState("");const [working,setWorking]=useState(false);
  async function load(){
    const [d,s]=await Promise.all([fetch("/api/credentials"),fetch("/api/driver-safety")]);
    if(d.status===401||s.status===401){location.href="/login";return;}
    const dx=await d.json().catch(()=>({}));const sx=await s.json().catch(()=>({}));
    if(d.ok)setDocuments(dx.documents||[]);else setMessage(dx.error||"Unable to load credentials");
    if(s.ok){const rows=sx.organizations||[];setSafety(rows);if(!reviewOrg&&rows[0])setReviewOrg(rows[0].organization.id);}
  }
  useEffect(()=>{void load();},[]);
  async function upload(documentType:string,file:File){
    setWorking(true);setMessage("Creating secure upload…");
    try{
      const start=await fetch("/api/credentials",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"create_upload",documentType,filename:file.name,contentType:file.type,sizeBytes:file.size})});
      const sx=await start.json().catch(()=>({}));if(!start.ok)throw new Error(sx.error||"Unable to create upload");
      const put=await fetch(sx.result.uploadUrl,{method:"PUT",headers:{"content-type":file.type},body:file});
      if(!put.ok)throw new Error("Secure storage upload failed. Check the private bucket CORS policy.");
      const done=await fetch("/api/credentials",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"finalize_upload",documentId:sx.result.documentId})});
      const dx=await done.json().catch(()=>({}));if(!done.ok)throw new Error(dx.error||"Unable to finalize document");
      setMessage(`${labels[documentType]||"Document"} uploaded securely.`);await load();
    }catch(error){setMessage(error instanceof Error?error.message:"Upload failed");}finally{setWorking(false);}
  }
  async function view(documentId:string){const r=await fetch("/api/credentials",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"view",documentId,organizationId:reviewOrg||null})});const x=await r.json().catch(()=>({}));if(!r.ok){setMessage(x.error||"Unable to open document");return;}window.open(x.result.url,"_blank","noopener,noreferrer");}
  async function process(documentId:string){if(!reviewOrg){setMessage("Choose an organization first.");return;}setWorking(true);setMessage("Running fact extraction and preparing organization review…");const r=await fetch("/api/credentials",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"process",documentId,organizationId:reviewOrg})});const x=await r.json().catch(()=>({}));setWorking(false);if(!r.ok){setMessage(x.error||"Automated review failed");return;}setMessage("Automated fact extraction complete. The organization still makes the approval decision.");await load();}
  function uploader(type:string){return <label style={{display:"inline-block",padding:"10px 13px",border:"1px solid #cbd5e1",borderRadius:9,fontWeight:800,cursor:working?"default":"pointer",background:"white"}}>{working?"Working…":`Upload ${labels[type]}`}<input disabled={working} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(type,f);e.currentTarget.value="";}}/></label>}
  const small={padding:"8px 11px",border:"1px solid #cbd5e1",borderRadius:8,background:"white",cursor:"pointer"} as const;
  return <main style={appPageStyle}><AppNav active="Credentials"/>
    <section style={{...appCardStyle,marginBottom:18}}><div style={{fontSize:13,fontWeight:900,letterSpacing:1,color:"#64748b"}}>DRIVER TRUST</div><h1 style={{margin:"7px 0"}}>Credential Vault</h1><p style={{color:"#475569",lineHeight:1.6}}>Driver documents are stored in private object storage and are never published at permanent URLs. Automated review only extracts facts; the organization makes the approval decision.</p><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{uploader("driver_license")}{uploader("insurance")}{uploader("volunteer_approval")}</div>{safety.length>0&&<div style={{marginTop:16}}><label><strong>Submit / review for organization</strong></label><select value={reviewOrg} onChange={e=>setReviewOrg(e.target.value)} style={{display:"block",marginTop:6,padding:10,border:"1px solid #cbd5e1",borderRadius:9,minWidth:260}}>{safety.map(row=><option key={row.organization.id} value={row.organization.id}>{row.organization.name}</option>)}</select></div>}</section>
    <section style={{...appCardStyle,marginBottom:18}}><h2 style={{marginTop:0}}>Your Documents</h2>{!documents.length?<p>No credentials uploaded yet.</p>:documents.map(d=><div key={d.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap",padding:"12px 0",borderBottom:"1px solid #e2e8f0"}}><div><strong>{labels[d.document_type]||d.document_type}</strong><div style={{fontSize:13,color:"#64748b",marginTop:3}}>{d.original_filename||"Document"} · {String(d.status).replaceAll("_"," ")}{d.expires_at?` · expires ${new Date(d.expires_at).toLocaleDateString()}`:""}</div></div><div style={{display:"flex",gap:7,flexWrap:"wrap"}}>{d.status!=="pending_upload"&&<button onClick={()=>view(d.id)} style={small}>View</button>}{["uploaded","ready","rejected"].includes(d.status)&&<button disabled={working||!reviewOrg} onClick={()=>process(d.id)} style={{...small,fontWeight:800}}>{d.document_type==="volunteer_approval"?"Submit for Review":"Run Automated Review"}</button>}</div></div>)}</section>
    <section style={appCardStyle}><h2 style={{marginTop:0}}>Driver Eligibility</h2>{!safety.length?<p>Join an organization to see its driver requirements.</p>:safety.map(row=><div key={row.organization.id} style={{padding:"14px 0",borderBottom:"1px solid #e2e8f0"}}><div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}><strong>{row.organization.name}</strong><span style={{fontWeight:900,color:row.eligible?"#166534":"#991b1b"}}>{row.eligible?"ELIGIBLE":"NOT YET ELIGIBLE"}</span></div>{!row.eligible&&<ul style={{marginBottom:0,color:"#7f1d1d"}}>{(row.reasons||[]).map((r:string)=><li key={r}>{r}</li>)}</ul>}</div>)}</section>
    {message&&<div style={{position:"fixed",right:20,bottom:20,maxWidth:520,padding:14,borderRadius:12,background:"#101b33",color:"white"}}>{message}</div>}
  </main>;
}
