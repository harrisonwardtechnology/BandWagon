"use client";

import { useEffect,useState } from "react";

type Context={supportSessionId:string;operatorDisplayName:string;reason:string;mode:"view"|"assist";expiresAt:string};
type State={supportMode:Context|null;viewingAs:{displayName:string}|null};

export default function SupportModeBanner(){
  const[state,setState]=useState<State>({supportMode:null,viewingAs:null});
  useEffect(()=>{fetch('/api/support-context',{cache:'no-store'}).then(r=>r.json()).then(d=>setState({supportMode:d.supportMode||null,viewingAs:d.viewingAs||null})).catch(()=>{});},[]);
  if(!state.supportMode)return null;
  const end=async()=>{await fetch('/api/admin/support-mode/end',{method:'POST'}).catch(()=>null);window.location.href='/admin/support-mode';};
  return <div style={{position:'sticky',top:0,zIndex:99999,background:'#fef3c7',borderBottom:'2px solid #f59e0b',padding:'10px 14px',fontFamily:'system-ui,sans-serif',display:'flex',alignItems:'center',justifyContent:'center',gap:14,flexWrap:'wrap',color:'#78350f'}}>
    <strong>SUPPORT MODE · READ ONLY</strong>
    <span>Viewing as <strong>{state.viewingAs?.displayName||'user'}</strong></span>
    <span style={{fontSize:13}}>Reason: {state.supportMode.reason}</span>
    <button onClick={end} style={{border:'1px solid #92400e',background:'white',color:'#78350f',borderRadius:8,padding:'6px 10px',fontWeight:800,cursor:'pointer'}}>End Support Mode</button>
  </div>;
}
