"use client";

import { useEffect, useState } from "react";

type Row = Record<string, any>;
function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100); }

function Meter({ percent }: { percent: number }) {
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  const color = value >= 100 ? "#b91c1c" : value >= 80 ? "#b45309" : "#166534";
  return <div role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} style={{ height: 12, background: "#e2e8f0", borderRadius: 99, overflow: "hidden", margin: "8px 0" }}><div style={{ width: `${value}%`, height: "100%", background: color }} /></div>;
}

export default function UsageAdmin() {
  const [organizations, setOrganizations] = useState<Row[]>([]);
  const [overview, setOverview] = useState<Row | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [org, setOrg] = useState("");
  const [usage, setUsage] = useState<Row | null>(null);
  const [capDollars, setCapDollars] = useState("");
  const [useDefault, setUseDefault] = useState(true);
  const [threshold, setThreshold] = useState(80);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  function applyUsage(u: Row) {
    setUsage(u);
    setUseDefault(Boolean(u.texting.usesPlatformDefault));
    setCapDollars((u.texting.capCents / 100).toFixed(2));
    setThreshold(u.texting.alertThresholdPercent);
    setNotes(u.texting.notes || "");
  }
  async function loadOrg(id: string) {
    setOrg(id); setUsage(null); setMessage("");
    if (!id) return;
    const r = await fetch(`/api/admin/usage?organizationId=${encodeURIComponent(id)}`);
    const x = await r.json().catch(() => ({}));
    if (!r.ok) { setMessage(x.error || "Unable to load usage"); return; }
    setCanEdit(Boolean(x.canEditLimits));
    applyUsage(x.usage);
  }
  async function loadAll() {
    const r = await fetch("/api/admin/usage");
    const x = await r.json().catch(() => ({}));
    if (!r.ok) { setMessage(x.error || "Unable to load usage"); return; }
    setOrganizations(x.organizations || []); setOverview(x.overview || null); setCanEdit(Boolean(x.canEditLimits));
    if (x.organizations?.length === 1) void loadOrg(x.organizations[0].id);
  }
  useEffect(() => { void loadAll(); }, []);

  async function saveLimit() {
    if (!org) return;
    setWorking(true); setMessage("");
    const r = await fetch("/api/admin/usage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "set-limit", organizationId: org, useDefault, monthlyCostCapCents: useDefault ? null : Math.round(Number(capDollars) * 100), alertThresholdPercent: threshold, notes }) });
    const x = await r.json().catch(() => ({}));
    setWorking(false);
    if (!r.ok) { setMessage(x.error || "Unable to save the texting limit"); return; }
    applyUsage(x.usage); setMessage("Texting limit saved and recorded in the audit history."); void loadAll();
  }

  const card = { marginTop: 18, padding: 22, border: "1px solid #dbe3ef", borderRadius: 16 } as const;
  const field = { display: "block", width: "100%", padding: 10, border: "1px solid #cbd5e1", borderRadius: 9, margin: "6px 0 14px", boxSizing: "border-box" as const };
  const t = usage?.texting;
  const ai = usage?.ai;

  return <main style={{ maxWidth: 960, margin: "36px auto", padding: "0 20px", fontFamily: "system-ui,sans-serif" }}>
    <header style={{ background: "#101b33", color: "white", padding: 28, borderRadius: 22 }}>
      <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1 }}>BANDWAGON ADMIN</div>
      <h1 style={{ margin: "6px 0" }}>Texting and AI Usage</h1>
      <p style={{ marginBottom: 0, opacity: .9, lineHeight: 1.55 }}>BandWagon is free to your organization. To keep it that way for everyone, each organization has a fair use monthly texting allowance. Push notifications and email are not limited.</p>
    </header>

    <section style={card}>
      <label><strong>Organization</strong></label>
      <select value={org} onChange={e => void loadOrg(e.target.value)} style={field}>
        <option value="">Choose an organization</option>
        {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      {t && <>
        <h2 style={{ margin: "4px 0" }}>Texting this month ({usage?.month?.slice(0, 7)})</h2>
        <p style={{ margin: "4px 0", fontSize: 18 }}><strong>{money(t.usedCents)}</strong> of {money(t.capCents)} used ({t.percent}%){t.usesPlatformDefault ? " · platform default allowance" : " · custom allowance"}</p>
        <Meter percent={t.percent} />
        {t.limitReached && <p role="status" style={{ padding: 12, borderRadius: 10, background: "#fee2e2", color: "#7f1d1d", fontWeight: 700 }}>The monthly texting limit has been reached. Routine and important texts are paused until next month. People still get push notifications and email.</p>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginTop: 12 }}>
          <div style={{ padding: 12, background: "#f8fafc", borderRadius: 10 }}><strong>{t.messagesSent}</strong><div>texts sent</div></div>
          <div style={{ padding: 12, background: "#f8fafc", borderRadius: 10 }}><strong>{t.protectedMessagesSent}</strong><div>safety and sign-in texts (always sent)</div></div>
          <div style={{ padding: 12, background: "#f8fafc", borderRadius: 10 }}><strong>{t.messagesPaused}</strong><div>texts paused by the limit</div></div>
        </div>
        <p style={{ color: "#475569", lineHeight: 1.5, fontSize: 14 }}>Safety alerts, driver arriving messages, cancellations, and sign-in codes are always sent, even over the limit, and still count toward usage. Admins get an email when usage reaches {t.alertThresholdPercent}% and 100%. Costs are planning estimates.</p>

        <h2 style={{ marginBottom: 4 }}>AI this month</h2>
        {ai?.enabled
          ? <><p style={{ margin: "4px 0" }}><strong>{money(ai.usedCents)}</strong>{ai.budgetCents != null ? <> of {money(ai.budgetCents)} AI cap ({ai.percent}%)</> : " used"} · {ai.jobs} AI jobs</p>{ai.budgetCents != null && <Meter percent={ai.percent} />}</>
          : <p style={{ margin: "4px 0" }}>AI features are off for this organization.{ai?.usedCents ? ` Earlier usage this month: ${money(ai.usedCents)}.` : ""}</p>}
        <p style={{ color: "#475569", fontSize: 14 }}>The AI cap is set on the <a href="/admin/ai-settings">AI Controls</a> page.</p>

        {canEdit ? <div style={{ marginTop: 18, padding: 18, border: "2px solid #cbd5e1", borderRadius: 14 }}>
          <h3 style={{ marginTop: 0 }}>Platform owner: adjust texting allowance</h3>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={useDefault} onChange={e => setUseDefault(e.target.checked)} /> Use the platform default ({money(t.platformDefaultCents)} per month)</label>
          {!useDefault && <><label style={{ display: "block", marginTop: 12 }}><strong>Monthly allowance (USD)</strong></label><input type="number" min={0} step="1" value={capDollars} onChange={e => setCapDollars(e.target.value)} style={field} /></>}
          <label style={{ display: "block", marginTop: 12 }}><strong>Early alert at (percent)</strong></label>
          <input type="number" min={1} max={99} value={threshold} onChange={e => setThreshold(Number(e.target.value))} style={field} />
          <label><strong>Internal note (optional)</strong></label>
          <textarea maxLength={1000} value={notes} onChange={e => setNotes(e.target.value)} style={{ ...field, minHeight: 70 }} />
          <button disabled={working} onClick={saveLimit} style={{ padding: "12px 16px", border: 0, borderRadius: 9, background: "#101b33", color: "white", fontWeight: 900, cursor: "pointer" }}>{working ? "Saving…" : "Save Allowance"}</button>
        </div> : <p style={{ color: "#475569", fontSize: 14 }}>Need a higher texting allowance? Contact BandWagon Support.</p>}
      </>}
    </section>

    {overview && <section style={card}>
      <h2 style={{ marginTop: 0 }}>All organizations ({overview.month?.slice(0, 7)})</h2>
      <p style={{ color: "#475569", marginTop: 0 }}>Platform default allowance: {money(overview.platformDefaultCents)} per month (ORG_DEFAULT_MONTHLY_SMS_CAP_CENTS).</p>
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ textAlign: "left", borderBottom: "1px solid #dbe3ef" }}><th style={{ padding: 8 }}>Organization</th><th style={{ padding: 8 }}>Used</th><th style={{ padding: 8 }}>Allowance</th><th style={{ padding: 8 }}>Percent</th><th style={{ padding: 8 }}>Paused</th></tr></thead>
        <tbody>{(overview.organizations || []).map((o: Row) => <tr key={o.id} style={{ borderBottom: "1px solid #eef2f7" }}>
          <td style={{ padding: 8 }}><button onClick={() => void loadOrg(o.id)} style={{ background: "none", border: 0, padding: 0, color: "#1d4ed8", cursor: "pointer", textDecoration: "underline" }}>{o.name}</button></td>
          <td style={{ padding: 8 }}>{money(o.usedCents)}</td>
          <td style={{ padding: 8 }}>{money(o.capCents)}{o.usesPlatformDefault ? " (default)" : ""}</td>
          <td style={{ padding: 8, fontWeight: o.percent >= 80 ? 800 : 400 }}>{o.percent}%</td>
          <td style={{ padding: 8 }}>{o.messagesPaused}</td>
        </tr>)}</tbody>
      </table></div>
    </section>}

    {message && <p aria-live="polite" style={{ padding: 14, background: "#f1f5f9", borderRadius: 12 }}>{message}</p>}
    <p><a href="/admin/operations">← Operations Dashboard</a></p>
  </main>;
}
