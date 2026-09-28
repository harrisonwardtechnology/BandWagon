"use client";

import { useEffect, useState } from "react";

type Row = Record<string, any>;

function when(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Not set";
}
function directionLabel(direction: string) {
  return direction === "to_event" ? "To event" : direction === "from_event" ? "From event" : direction === "round_trip" ? "Round trip" : "Other";
}

export default function WaitlistAdmin() {
  const [organizations, setOrganizations] = useState<Row[]>([]);
  const [org, setOrg] = useState("");
  const [data, setData] = useState<Row | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [windowMinutes, setWindowMinutes] = useState(30);
  const [cutoffMinutes, setCutoffMinutes] = useState(15);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  function apply(x: Row) { setData(x); setEnabled(Boolean(x.settings.enabled)); setWindowMinutes(x.settings.offerWindowMinutes); setCutoffMinutes(x.settings.departureCutoffMinutes); }
  async function loadOrg(id: string) {
    setOrg(id); setData(null); setMessage("");
    if (!id) return;
    const r = await fetch(`/api/admin/waitlists?organizationId=${encodeURIComponent(id)}`);
    const x = await r.json().catch(() => ({}));
    if (!r.ok) { setMessage(x.error || "Unable to load waitlists"); return; }
    apply(x);
  }
  useEffect(() => { void (async () => {
    const r = await fetch("/api/admin/waitlists");
    const x = await r.json().catch(() => ({}));
    if (!r.ok) { setMessage(x.error || "Unable to load organizations"); return; }
    setOrganizations(x.organizations || []);
    if (x.organizations?.length === 1) void loadOrg(x.organizations[0].id);
  })(); }, []);

  async function save() {
    setWorking(true); setMessage("");
    const r = await fetch("/api/admin/waitlists", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "update-settings", organizationId: org, enabled, offerWindowMinutes: windowMinutes, departureCutoffMinutes: cutoffMinutes }) });
    const x = await r.json().catch(() => ({}));
    setWorking(false);
    if (!r.ok) { setMessage(x.error || "Unable to save waitlist settings"); return; }
    apply(x); setMessage("Waitlist settings saved.");
  }

  const card = { marginTop: 18, padding: 22, border: "1px solid #dbe3ef", borderRadius: 16 } as const;
  const field = { display: "block", width: "100%", padding: 10, border: "1px solid #cbd5e1", borderRadius: 9, margin: "6px 0 14px", boxSizing: "border-box" as const };
  const groups: Record<string, Row[]> = {};
  for (const e of data?.entries || []) (groups[e.ride_id] ||= []).push(e);

  return <main style={{ maxWidth: 1000, margin: "36px auto", padding: "0 20px", fontFamily: "system-ui,sans-serif" }}>
    <header style={{ background: "#101b33", color: "white", padding: 28, borderRadius: 22 }}>
      <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1 }}>BANDWAGON ADMIN</div>
      <h1 style={{ margin: "6px 0" }}>Waitlists</h1>
      <p style={{ marginBottom: 0, opacity: .9, lineHeight: 1.55 }}>When a carpool is full, families can join its waitlist. If a seat opens, the first rider in line gets a short time to accept it before it goes to the next person.</p>
    </header>

    <section style={card}>
      <label><strong>Organization</strong></label>
      <select value={org} onChange={e => void loadOrg(e.target.value)} style={field}>
        <option value="">Choose An Organization</option>
        {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </section>

    {data && <section style={card}>
      <h2 style={{ marginTop: 0 }}>Settings</h2>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: 14, border: "2px solid #cbd5e1", borderRadius: 12, marginBottom: 14 }}>
        <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} style={{ marginTop: 4 }} />
        <span><strong>Allow Waitlists On Full Carpools</strong><span style={{ display: "block", color: "#475569", marginTop: 4, lineHeight: 1.45 }}>On by default. Turning this off clears every open waitlist and tells the families on it.</span></span>
      </label>
      <label htmlFor="offer-window"><strong>Minutes To Accept An Open Seat</strong></label>
      <input id="offer-window" type="number" min={data.limits.offerWindow.min} max={data.limits.offerWindow.max} value={windowMinutes} onChange={e => setWindowMinutes(Number(e.target.value))} style={field} />
      <label htmlFor="cutoff"><strong>Stop Offering Seats This Many Minutes Before Departure</strong></label>
      <input id="cutoff" type="number" min={data.limits.departureCutoff.min} max={data.limits.departureCutoff.max} value={cutoffMinutes} onChange={e => setCutoffMinutes(Number(e.target.value))} style={field} />
      <p style={{ color: "#475569", lineHeight: 1.5 }}>Close to departure, offers get shorter (at most half the time left) so there is still time for the next person if someone passes.</p>
      <button disabled={working} onClick={save} style={{ padding: "12px 16px", border: 0, borderRadius: 9, background: "#101b33", color: "white", fontWeight: 900, cursor: "pointer" }}>{working ? "Saving…" : "Save Waitlist Settings"}</button>
    </section>}

    {data && <section style={card}>
      <h2 style={{ marginTop: 0 }}>Open Waitlists</h2>
      {!Object.keys(groups).length && <p>No one is on a waitlist right now.</p>}
      {Object.entries(groups).map(([rideId, entries]) => <div key={rideId} style={{ padding: "12px 0", borderBottom: "1px solid #e2e8f0" }}>
        <b>{entries[0].event_title || "Carpool"}</b> · {directionLabel(entries[0].direction)} · {when(entries[0].departure_at)} · driver {entries[0].driver_name} · {entries[0].seats_reserved} of {entries[0].capacity_snapshot} seats taken
        <ol style={{ margin: "8px 0 0" }}>
          {entries.map(e => <li key={e.id}>{e.passenger_name}{e.joined_by_name && e.joined_by_name !== e.passenger_name ? ` (added by ${e.joined_by_name})` : ""} · joined {when(e.joined_at)}
            {e.status === "offered" ? ` · seat offered until ${when(e.offer_expires_at)}` : ""}
            {e.guardian_approval_status === "pending" ? " · waiting for guardian approval" : ""}</li>)}
        </ol>
      </div>)}
      {data.last30Days?.length > 0 && <p style={{ color: "#64748b", fontSize: 13 }}>Last 30 days: {data.last30Days.map((r: Row) => `${r.count} ${r.status}`).join(", ")}.</p>}
    </section>}

    {message && <p aria-live="polite" style={{ padding: 14, background: "#f1f5f9", borderRadius: 12 }}>{message}</p>}
    <p><a href="/admin/rides">Rides</a> · <a href="/admin/operations">Operations Dashboard</a></p>
  </main>;
}
