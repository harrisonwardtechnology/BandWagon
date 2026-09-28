"use client";

import { useEffect, useState } from "react";

type Row = Record<string, any>;

const METRICS: Array<[string, string]> = [
  ["completedRides", "Completed rides"],
  ["ridersServed", "Riders served"],
  ["seatsShared", "Seats shared"],
  ["avoidedTrips", "Car trips avoided"],
  ["vehicleMilesAvoided", "Vehicle miles avoided"],
  ["drivingHoursSaved", "Driving hours saved"],
  ["co2KgAvoided", "CO2 avoided"],
  ["activeDrivers", "Active drivers"],
  ["familiesParticipating", "Families participating"],
];

export default function ImpactAdmin() {
  const [organizations, setOrganizations] = useState<Row[]>([]);
  const [org, setOrg] = useState("");
  const [report, setReport] = useState<Row | null>(null);
  const [publicOn, setPublicOn] = useState(false);
  const [miles, setMiles] = useState(5);
  const [minutes, setMinutes] = useState(15);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  function apply(r: Row) { setReport(r); setPublicOn(Boolean(r.settings.publicImpactEnabled)); setMiles(r.settings.milesPerTrip); setMinutes(r.settings.minutesPerTrip); }
  async function loadOrg(id: string) {
    setOrg(id); setReport(null); setMessage("");
    if (!id) return;
    const r = await fetch(`/api/admin/impact?organizationId=${encodeURIComponent(id)}`);
    const x = await r.json().catch(() => ({}));
    if (!r.ok) { setMessage(x.error || "Unable to load the impact report"); return; }
    apply(x.report);
  }
  useEffect(() => { void (async () => {
    const r = await fetch("/api/admin/impact");
    const x = await r.json().catch(() => ({}));
    if (!r.ok) { setMessage(x.error || "Unable to load organizations"); return; }
    setOrganizations(x.organizations || []);
    if (x.organizations?.length === 1) void loadOrg(x.organizations[0].id);
  })(); }, []);

  async function save() {
    setWorking(true); setMessage("");
    const r = await fetch("/api/admin/impact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "update-settings", organizationId: org, publicImpactEnabled: publicOn, milesPerTrip: miles, minutesPerTrip: minutes }) });
    const x = await r.json().catch(() => ({}));
    setWorking(false);
    if (!r.ok) { setMessage(x.error || "Unable to save impact settings"); return; }
    apply(x.report); setMessage("Impact settings saved.");
  }

  const card = { marginTop: 18, padding: 22, border: "1px solid #dbe3ef", borderRadius: 16 } as const;
  const field = { display: "block", width: "100%", padding: 10, border: "1px solid #cbd5e1", borderRadius: 9, margin: "6px 0 14px", boxSizing: "border-box" as const };
  const slug = report?.organization?.slug;

  return <main style={{ maxWidth: 1000, margin: "36px auto", padding: "0 20px", fontFamily: "system-ui,sans-serif" }}>
    <header style={{ background: "#101b33", color: "white", padding: 28, borderRadius: 22 }}>
      <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1 }}>BANDWAGON ADMIN</div>
      <h1 style={{ margin: "6px 0" }}>Impact Report</h1>
      <p style={{ marginBottom: 0, opacity: .9, lineHeight: 1.55 }}>What carpooling through BandWagon has added up to for your families. Totals only, no names. Small numbers are hidden to protect privacy.</p>
    </header>

    <section style={card}>
      <label><strong>Organization</strong></label>
      <select value={org} onChange={e => void loadOrg(e.target.value)} style={field}>
        <option value="">Choose An Organization</option>
        {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      {report && <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <a href={`/api/admin/impact?organizationId=${encodeURIComponent(org)}&format=csv`} style={{ padding: "10px 14px", borderRadius: 9, background: "#101b33", color: "white", fontWeight: 800, textDecoration: "none" }}>Download CSV For Board Meetings</a>
        <a href={`/admin/sponsors/packet?organizationId=${encodeURIComponent(org)}`} style={{ padding: "10px 14px", borderRadius: 9, border: "1px solid #101b33", color: "#101b33", fontWeight: 800, textDecoration: "none" }}>Sponsor Packet</a>
      </div>}
    </section>

    {report && <section style={card}>
      <h2 style={{ marginTop: 0 }}>{report.organization.name}</h2>
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ textAlign: "left", borderBottom: "1px solid #dbe3ef" }}><th style={{ padding: 8 }}>Measure</th>{report.rows.map((row: Row) => <th key={row.key} style={{ padding: 8 }}>{row.label}</th>)}</tr></thead>
        <tbody>{METRICS.map(([key, label]) => <tr key={key} style={{ borderBottom: "1px solid #eef2f7" }}><td style={{ padding: 8, fontWeight: 700 }}>{label}</td>{report.rows.map((row: Row) => <td key={row.key} style={{ padding: 8 }}>{row.display[key]}</td>)}</tr>)}</tbody>
      </table></div>
      <h3>How These Numbers Are Estimated</h3>
      <ul style={{ lineHeight: 1.6, color: "#334155" }}>
        <li>{report.formulas.avoidedTrip}</li>
        <li>{report.formulas.miles}</li>
        <li>{report.formulas.hours}</li>
        <li>{report.formulas.co2}</li>
        <li>{report.formulas.privacy}</li>
      </ul>
      <p style={{ color: "#64748b", fontSize: 13 }}>School year runs August 1 to July 31. Estimates are intentionally conservative.</p>
    </section>}

    {report && <section style={card}>
      <h2 style={{ marginTop: 0 }}>Settings</h2>
      <label><strong>Miles Per Avoided Car Trip</strong></label>
      <input type="number" min={0.5} max={50} step="0.5" value={miles} onChange={e => setMiles(Number(e.target.value))} style={field} />
      <label><strong>Minutes Per Avoided Car Trip</strong></label>
      <input type="number" min={1} max={120} step="1" value={minutes} onChange={e => setMinutes(Number(e.target.value))} style={field} />
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: 14, border: "2px solid #cbd5e1", borderRadius: 12 }}>
        <input type="checkbox" checked={publicOn} onChange={e => setPublicOn(e.target.checked)} style={{ marginTop: 4 }} />
        <span><strong>Show A Public Impact Page</strong><span style={{ display: "block", color: "#475569", marginTop: 4, lineHeight: 1.45 }}>Off by default. When on, anyone with the link can see school year and all time totals and your public sponsors. No names, no rides, no locations. Small numbers stay hidden.{slug ? <> Link: <a href={`/impact/${slug}`}>/impact/{slug}</a></> : null}</span></span>
      </label>
      <button disabled={working} onClick={save} style={{ marginTop: 14, padding: "12px 16px", border: 0, borderRadius: 9, background: "#101b33", color: "white", fontWeight: 900, cursor: "pointer" }}>{working ? "Saving…" : "Save Impact Settings"}</button>
    </section>}

    {message && <p aria-live="polite" style={{ padding: 14, background: "#f1f5f9", borderRadius: 12 }}>{message}</p>}
    <p><a href="/admin/sponsors">Sponsors</a> · <a href="/admin/usage">Texting And AI Usage</a> · <a href="/admin/operations">Operations Dashboard</a></p>
  </main>;
}
