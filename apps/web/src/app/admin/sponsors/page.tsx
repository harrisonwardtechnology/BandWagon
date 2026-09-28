"use client";

import { useEffect, useState } from "react";

// Core Funding Boundary: sponsors get adult-facing recognition only. They never
// receive participant data, never get matching priority, and never get
// targeted advertising. This page manages recognition records only.

type Row = Record<string, any>;
const EMPTY = { sponsorName: "", sponsorWebsite: "", logoUrl: "", tierLabel: "Community", publicDisplay: true, startsAt: "", endsAt: "", internalNotes: "" };
function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100); }
function day(value: string | null | undefined) { return value ? new Date(value).toISOString().slice(0, 10) : ""; }

export default function SponsorsAdmin() {
  const [organizations, setOrganizations] = useState<Row[]>([]);
  const [org, setOrg] = useState("");
  const [sponsors, setSponsors] = useState<Row[]>([]);
  const [payments, setPayments] = useState<Row | null>(null);
  const [form, setForm] = useState<Row>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  async function loadOrg(id: string) {
    setOrg(id); setSponsors([]); setPayments(null); setMessage(""); setEditing(null); setForm(EMPTY);
    if (!id) return;
    const r = await fetch(`/api/admin/sponsors?organizationId=${encodeURIComponent(id)}`);
    const x = await r.json().catch(() => ({}));
    if (!r.ok) { setMessage(x.error || "Unable to load sponsors"); return; }
    setSponsors(x.sponsors || []); setPayments(x.payments || null);
  }
  useEffect(() => { void (async () => {
    const r = await fetch("/api/admin/sponsors");
    const x = await r.json().catch(() => ({}));
    if (!r.ok) { setMessage(x.error || "Unable to load organizations"); return; }
    setOrganizations(x.organizations || []);
    if (x.organizations?.length === 1) void loadOrg(x.organizations[0].id);
  })(); }, []);

  async function post(body: Row, done: string) {
    setWorking(true); setMessage("");
    const r = await fetch("/api/admin/sponsors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organizationId: org, ...body }) });
    const x = await r.json().catch(() => ({}));
    setWorking(false);
    if (!r.ok) { setMessage(x.error || "Unable to save the sponsor"); return; }
    await loadOrg(org); setMessage(done);
  }
  function edit(s: Row) {
    setEditing(s.id);
    setForm({ sponsorName: s.sponsor_name || "", sponsorWebsite: s.sponsor_website || "", logoUrl: s.logo_url || "", tierLabel: s.tier_label || "", publicDisplay: Boolean(s.public_display), startsAt: day(s.starts_at), endsAt: day(s.ends_at), internalNotes: s.internal_notes || "" });
  }

  const card = { marginTop: 18, padding: 22, border: "1px solid #dbe3ef", borderRadius: 16 } as const;
  const field = { display: "block", width: "100%", padding: 10, border: "1px solid #cbd5e1", borderRadius: 9, margin: "6px 0 14px", boxSizing: "border-box" as const };
  const button = { padding: "10px 14px", border: 0, borderRadius: 9, background: "#101b33", color: "white", fontWeight: 800, cursor: "pointer" } as const;

  return <main style={{ maxWidth: 1000, margin: "36px auto", padding: "0 20px", fontFamily: "system-ui,sans-serif" }}>
    <header style={{ background: "#101b33", color: "white", padding: 28, borderRadius: 22 }}>
      <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1 }}>BANDWAGON ADMIN</div>
      <h1 style={{ margin: "6px 0" }}>Local Sponsors</h1>
      <p style={{ marginBottom: 0, opacity: .9, lineHeight: 1.55 }}>Thank the local businesses that help keep BandWagon free for your families. Sponsors are recognized to adults only. They never see who rides, who drives, or where anyone lives.</p>
    </header>

    <section style={{ ...card, background: "#f8fafc" }}>
      <strong>What Sponsors Get, And What They Never Get</strong>
      <ul style={{ lineHeight: 1.6, marginBottom: 0 }}>
        <li>Recognition for adults: a logo and link on your public impact page (if you turn it on), and thanks in your own newsletters and meetings.</li>
        <li>Never any participant data: no names, contact details, ride history, schedules, or locations.</li>
        <li>Never any matching priority or special treatment in rides.</li>
        <li>Never any targeted ads or messages to your families or students.</li>
      </ul>
    </section>

    <section style={card}>
      <label><strong>Organization</strong></label>
      <select value={org} onChange={e => void loadOrg(e.target.value)} style={field}>
        <option value="">Choose An Organization</option>
        {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      {org && <a href={`/admin/sponsors/packet?organizationId=${encodeURIComponent(org)}`} style={{ ...button, display: "inline-block", textDecoration: "none" }}>Open Printable Sponsor Packet</a>}
    </section>

    {org && <section style={card}>
      <h2 style={{ marginTop: 0 }}>{editing ? "Edit Sponsor" : "Add A Sponsor"}</h2>
      <label><strong>Business Name</strong></label>
      <input maxLength={120} value={form.sponsorName} onChange={e => setForm({ ...form, sponsorName: e.target.value })} style={field} />
      <label><strong>Website (HTTPS Only)</strong></label>
      <input maxLength={500} placeholder="https://example.com" value={form.sponsorWebsite} onChange={e => setForm({ ...form, sponsorWebsite: e.target.value })} style={field} />
      <label><strong>Logo Image Address (HTTPS Only)</strong></label>
      <input maxLength={500} placeholder="https://example.com/logo.png" value={form.logoUrl} onChange={e => setForm({ ...form, logoUrl: e.target.value })} style={field} />
      <label><strong>Recognition Level</strong></label>
      <input maxLength={40} list="sponsor-tiers" value={form.tierLabel} onChange={e => setForm({ ...form, tierLabel: e.target.value })} style={field} />
      <datalist id="sponsor-tiers"><option value="Gold" /><option value="Silver" /><option value="Bronze" /><option value="Community" /></datalist>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
        <div><label><strong>Start Date</strong></label><input type="date" value={form.startsAt} onChange={e => setForm({ ...form, startsAt: e.target.value })} style={field} /></div>
        <div><label><strong>End Date (Optional)</strong></label><input type="date" value={form.endsAt} onChange={e => setForm({ ...form, endsAt: e.target.value })} style={field} /></div>
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}><input type="checkbox" checked={Boolean(form.publicDisplay)} onChange={e => setForm({ ...form, publicDisplay: e.target.checked })} /> Show Publicly <span style={{ color: "#64748b" }}>(on your public impact page, if it is turned on)</span></label>
      <label><strong>Internal Notes (Admins Only, Never Shown Publicly)</strong></label>
      <textarea maxLength={2000} value={form.internalNotes} onChange={e => setForm({ ...form, internalNotes: e.target.value })} style={{ ...field, minHeight: 80 }} />
      <p style={{ color: "#64748b", fontSize: 13, marginTop: 0 }}>Do not put student or family information in sponsor notes.</p>
      <div style={{ display: "flex", gap: 10 }}>
        <button disabled={working} style={button} onClick={() => post({ action: editing ? "update" : "create", sponsorId: editing, ...form, startsAt: form.startsAt || null, endsAt: form.endsAt || null }, editing ? "Sponsor updated." : "Sponsor added.")}>{working ? "Saving…" : editing ? "Save Changes" : "Add Sponsor"}</button>
        {editing && <button onClick={() => { setEditing(null); setForm(EMPTY); }} style={{ ...button, background: "#e2e8f0", color: "#0f172a" }}>Cancel</button>}
      </div>
    </section>}

    {org && <section style={card}>
      <h2 style={{ marginTop: 0 }}>Sponsors</h2>
      {sponsors.length === 0 && <p>No sponsors yet.</p>}
      {sponsors.map(s => <div key={s.id} style={{ display: "flex", gap: 14, alignItems: "center", padding: "12px 0", borderBottom: "1px solid #eef2f7", flexWrap: "wrap" }}>
        {/^https:\/\//i.test(s.logo_url || "") ? <img src={s.logo_url} alt="" referrerPolicy="no-referrer" style={{ width: 56, height: 56, objectFit: "contain", border: "1px solid #dbe3ef", borderRadius: 8 }} /> : <div style={{ width: 56, height: 56, borderRadius: 8, background: "#f1f5f9" }} />}
        <div style={{ flex: 1, minWidth: 220 }}>
          <strong>{s.sponsor_name}</strong>{s.tier_label ? ` · ${s.tier_label}` : ""} · {s.status === "active" ? (s.public_display ? "shown publicly" : s.contribution_id ? "paid online, review and edit to show publicly" : "not shown publicly") : "ended"}
          <div style={{ fontSize: 14, color: "#475569" }}>{day(s.starts_at)}{s.ends_at ? ` to ${day(s.ends_at)}` : " onward"}{/^https:\/\//i.test(s.sponsor_website || "") ? <> · <a href={s.sponsor_website} target="_blank" rel="noopener noreferrer nofollow">{s.sponsor_website}</a></> : null}</div>
          {s.internal_notes && <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>Note: {s.internal_notes}</div>}
        </div>
        <button onClick={() => edit(s)} style={{ ...button, background: "#e2e8f0", color: "#0f172a" }}>Edit</button>
        {s.status === "active" && <button disabled={working} onClick={() => { if (window.confirm(`End the sponsorship for ${s.sponsor_name}?`)) void post({ action: "end", sponsorId: s.id }, "Sponsorship ended."); }} style={{ ...button, background: "#fee2e2", color: "#7f1d1d" }}>End</button>}
      </div>)}
    </section>}

    {payments && <section style={card}>
      <h2 style={{ marginTop: 0 }}>Sponsorship Payments Through BandWagon</h2>
      <p style={{ margin: "4px 0" }}>Paid all time: <strong>{money(payments.paidCents)}</strong> · Paid this calendar year: <strong>{money(payments.paidThisYearCents)}</strong></p>
      <p style={{ color: "#64748b", fontSize: 13 }}>Payments support BandWagon platform operations and are not tax-deductible charitable contributions.</p>
      {payments.contributions.length === 0 ? <p>No sponsorship payments yet.</p> : <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ textAlign: "left", borderBottom: "1px solid #dbe3ef" }}><th style={{ padding: 8 }}>Date</th><th style={{ padding: 8 }}>Sponsor</th><th style={{ padding: 8 }}>Amount</th><th style={{ padding: 8 }}>Status</th><th style={{ padding: 8 }}>Public</th></tr></thead>
        <tbody>{payments.contributions.map((c: Row) => <tr key={c.id} style={{ borderBottom: "1px solid #eef2f7" }}><td style={{ padding: 8 }}>{day(c.paid_at || c.created_at)}</td><td style={{ padding: 8 }}>{c.anonymous ? "Anonymous" : c.sponsor_name || "Not provided"}</td><td style={{ padding: 8 }}>{money(c.amount_cents)}</td><td style={{ padding: 8 }}>{c.status}</td><td style={{ padding: 8 }}>{c.sponsor_display_publicly && !c.anonymous ? "Yes" : "No"}</td></tr>)}</tbody>
      </table></div>}
    </section>}

    {message && <p aria-live="polite" style={{ padding: 14, background: "#f1f5f9", borderRadius: 12 }}>{message}</p>}
    <p><a href="/admin/impact">Impact Report</a> · <a href="/admin/operations">Operations Dashboard</a></p>
  </main>;
}
