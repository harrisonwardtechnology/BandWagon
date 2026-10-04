"use client";

import { CalendarPlus, CarFront, House, IdCard, LogOut, Route, Settings, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

const links: [string, string, LucideIcon][] = [
  ["Home", "/app", House],
  ["Rides", "/app/rides", Route],
  ["Household", "/app/household", Users],
  ["Driver", "/app/driver", CarFront],
  ["Credentials", "/app/driver/credentials", IdCard],
  ["Safety", "/app/safety", ShieldCheck],
  ["Propose Event", "/app/event-proposals", CalendarPlus],
  ["Settings", "/app/settings/notifications", Settings],
];

export function AppNav({active}:{active?:string}) {
  async function signOut() {
    await fetch("/api/auth/session",{method:"DELETE"}).catch(()=>{});
    window.location.href="/login";
  }
  return <header className="app-header">
    <div className="app-header-top">
      <div className="app-brand"><BrandLogo /><span>Community rides, without the logistics web.</span></div>
      <button type="button" className="app-sign-out" onClick={signOut}><LogOut className="icon" aria-hidden="true" />Sign Out</button>
    </div>
    <nav aria-label="Application" className="app-nav">
      {links.map(([label,href,Icon])=><a key={href} href={href} aria-current={active===label?"page":undefined}><Icon className="icon" aria-hidden="true" />{label}</a>)}
    </nav>
  </header>;
}

export const appPageStyle = { maxWidth:1100,margin:"32px auto",padding:"0 20px" } as const;
export const appCardStyle = { background:"var(--surface)",border:"1px solid var(--line)",borderRadius:18,padding:20,boxShadow:"var(--shadow-card)" } as const;
