"use client";

import { useEffect,useState } from "react";
import { AppNav,appCardStyle,appPageStyle } from "@/components/app-nav";

type Row=Record<string,any>;

export default function HouseholdPage(){
  const [data,setData]=useState<Row|null>(null);
  const [message,setMessage]=useState("");
  const [working,setWorking]=useState(false);
  const [studentName,setStudentName]=useState("");
  const [birthYear,setBirthYear]=useState("");
  const [joinCode,setJoinCode]=useState("");
  async function load(){
    const r=await fetch("/api/onboarding"); const d=await r.json().catch(()=>({}));
    if(r.status===401){location.href="/login";return;}
    if(!r.ok){setMessage(d.error||"Unable to load household");return;}
    setData(d);
  }
  async function act(body:Row){
    setWorking(true);setMessage("");
    const r=await fetch("/api/onboarding",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    const d=await r.json().catch(()=>({}));setWorking(false);
    if(!r.ok){setMessage(d.error||"Unable to save");return;}
    setData({ok:true,identity:data?.identity,context:d.context});setMessage("Saved.");
  }
  useEffect(()=>{void load();},[]);
  const input={width:"100%",padding:10,border:"1px solid #cbd5e1",borderRadius:9,margin:"6px 0 12px",boxSizing:"border-box" as const};
  const button={padding:"10px 14px",border:0,borderRadius:9,background:"#101b33",color:"white",fontWeight:800,cursor:"pointer"} as const;
  const context=data?.context;
  return <main style={appPageStyle}><AppNav active="Household"/>{!context?<div style={appCardStyle}>Loading household…</div>:<>
    <section style={{...appCardStyle,marginBottom:18}}><h1 style={{marginTop:0}}>{context.household?.name||"Your household"}</h1><p style={{color:"#64748b"}}>Manage the riders and guardians connected to your account.</p>{context.members.map((m:Row)=><div key={m.id} style={{padding:"11px 0",borderBottom:"1px solid #f1f5f9"}}><b>{m.preferred_name||m.display_name}</b> <span style={{color:"#64748b"}}>· {m.household_role}</span>{m.person_type==='minor'&&<span style={{marginLeft:8,fontSize:12,background:"#eef2ff",padding:"3px 7px",borderRadius:999}}>guardian approval {m.student_approval_required?"on":"off"}</span>}</div>)}</section>
    {context.household?.can_manage_household&&<section style={{...appCardStyle,marginBottom:18}}><h2 style={{marginTop:0}}>Add a student</h2><label>Student name</label><input value={studentName} onChange={e=>setStudentName(e.target.value)} style={input}/><label>Birth year <span style={{color:"#64748b"}}>(optional)</span></label><input inputMode="numeric" value={birthYear} onChange={e=>setBirthYear(e.target.value.replace(/\D/g,""))} style={input}/><button disabled={working||!studentName.trim()} style={{...button,opacity:working ? .6 : 1}} onClick={async()=>{await act({action:"add_student",displayName:studentName,birthYear:birthYear||null,studentApprovalRequired:true});setStudentName("");setBirthYear("");}}>Add student</button></section>}
    <section style={{...appCardStyle,marginBottom:18}}><h2 style={{marginTop:0}}>Join an organization</h2><p style={{color:"#64748b"}}>Enter the join code provided by your organization.</p><input value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())} placeholder="JOIN CODE" style={{...input,fontSize:20,letterSpacing:2,textTransform:"uppercase"}}/><button disabled={working||!joinCode.trim()} style={{...button,opacity:working ? .6 : 1}} onClick={async()=>{await act({action:"join_organization",code:joinCode});setJoinCode("");}}>Join organization</button></section>
    <section style={appCardStyle}><h2 style={{marginTop:0}}>Memberships</h2>{context.organizations.length?context.organizations.map((o:Row)=><div key={o.id} style={{padding:"11px 0",borderBottom:"1px solid #f1f5f9"}}><b>{o.name}</b> <span style={{color:"#64748b"}}>· {o.role}</span>{context.members.filter((m:Row)=>m.person_type==='minor').map((m:Row)=><button key={m.id} disabled={working} onClick={()=>act({action:"add_student_to_organization",studentPersonId:m.id,organizationId:o.id})} style={{marginLeft:10,padding:"5px 8px",border:"1px solid #cbd5e1",borderRadius:8,background:"white",cursor:"pointer"}}>Add {m.preferred_name||m.display_name}</button>)}</div>):<p>No organization memberships yet.</p>}</section>
  </>}{message&&<div style={{position:"fixed",bottom:20,right:20,maxWidth:360,padding:14,background:"#101b33",color:"white",borderRadius:12}}>{message}</div>}</main>;
}
