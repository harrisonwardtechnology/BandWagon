"use client";

export function AppNav({active}:{active?:string}) {
  const links = [
    ["Home","/app"],
    ["Rides","/app/rides"],
    ["Household","/app/household"],
    ["Driver","/app/driver"],
    ["Credentials","/app/driver/credentials"],
    ["Safety","/app/safety"],
    ["Settings","/app/settings/notifications"],
  ];
  async function signOut() {
    await fetch("/api/auth/session",{method:"DELETE"}).catch(()=>{});
    window.location.href="/login";
  }
  return <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:18,flexWrap:"wrap",marginBottom:24}}>
    <div><div style={{fontWeight:950,fontSize:22}}>BandWagon</div><div style={{fontSize:12,color:"#64748b"}}>Community rides, without the logistics web.</div></div>
    <nav aria-label="Application" style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
      {links.map(([label,href])=><a key={href} href={href} aria-current={active===label?"page":undefined} style={{textDecoration:"none",padding:"9px 12px",borderRadius:10,color:active===label?"white":"#334155",background:active===label?"#101b33":"#f1f5f9",fontWeight:750}}>{label}</a>)}
      <button onClick={signOut} style={{padding:"9px 12px",border:"1px solid #cbd5e1",borderRadius:10,background:"white",cursor:"pointer"}}>Sign out</button>
    </nav>
  </header>;
}

export const appPageStyle = { maxWidth:1100,margin:"32px auto",padding:"0 20px",fontFamily:"system-ui,sans-serif" } as const;
export const appCardStyle = { background:"white",border:"1px solid #e2e8f0",borderRadius:18,padding:20,boxShadow:"0 4px 20px rgba(15,23,42,.04)" } as const;
