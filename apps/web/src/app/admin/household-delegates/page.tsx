"use client";

import { useEffect, useState } from "react";

type Row = Record<string, any>;

export default function HouseholdDelegatesAdmin() {
  const [organizations, setOrganizations] = useState<Row[]>([]);
  const [org, setOrg] = useState("");
  const [settings, setSettings] = useState<Row | null>(null);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  async function loadOrg(id: string) {
    setOrg(id); setSettings(null); setMessage("");
    if (!id) return;
    const r = await fetch(`/api/admin/household-delegates?organizationId=${encodeURIComponent(id)}`);
    const x = await r.json().catch(() => ({}));
    if (!r.ok) { setMessage(x.error || "Unable to load settings"); return; }
    setSettings(x.settings);
  }
  useEffect(() => { void (async () => {
    const r = await fetch("/api/admin/household-delegates");
    const x = await r.json().catch(() => ({}));
    if (!r.ok) { setMessage(x.error || "Unable to load organizations"); return; }
    setOrganizations(x.organizations || []);
    const fromUrl = new URL(window.location.href).searchParams.get("organizationId");
    if (fromUrl) void loadOrg(fromUrl);
    else if (x.organizations?.length === 1) void loadOrg(x.organizations[0].id);
  })(); }, []);

  async function save(enabled: boolean) {
    setWorking(true); setMessage("");
    const r = await fetch("/api/admin/household-delegates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "update-settings", organizationId: org, householdDelegatesEnabled: enabled }) });
    const x = await r.json().catch(() => ({}));
    setWorking(false);
    if (!r.ok) { setMessage(x.error || "Unable to save"); return; }
    setSettings(x.settings); setMessage("Saved.");
  }

  const card = { marginTop: 18, padding: 22, border: "1px solid #dbe3ef", borderRadius: 16 } as const;
  const field = { display: "block", width: "100%", padding: 10, border: "1px solid #cbd5e1", borderRadius: 9, margin: "6px 0 14px", boxSizing: "border-box" as const };

  return <main style={{ maxWidth: 860, margin: "36px auto", padding: "0 20px", fontFamily: "system-ui,sans-serif" }}>
    <header style={{ background: "#101b33", color: "white", padding: 28, borderRadius: 22 }}>
      <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1 }}>BANDWAGON ADMIN</div>
      <h1 style={{ margin: "6px 0" }}>Trusted Adults</h1>
      <p style={{ marginBottom: 0, opacity: .9, lineHeight: 1.55 }}>Parents can invite a trusted adult, like a grandparent or nanny, to help with their own children&apos;s rides. Trusted adults only act for those children. They do not become members of your organization.</p>
    </header>

    <section style={card}>
      <label><strong>Organization</strong></label>
      <select value={org} onChange={e => void loadOrg(e.target.value)} style={field}>
        <option value="">Choose an organization</option>
        {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      {settings && <label style={{ display: "flex", gap: 10, alignItems: "start" }}>
        <input type="checkbox" checked={Boolean(settings.householdDelegatesEnabled)} disabled={working} onChange={e => void save(e.target.checked)} />
        <span><b>Allow trusted adults</b><br /><small style={{ color: "#64748b" }}>When this is off, trusted adults cannot ask for, approve, or manage rides in {settings.name}. Parents and guardians are not affected.</small></span>
      </label>}
    </section>
    {message && <p style={{ padding: 14, background: "#eef2ff", borderRadius: 12, fontWeight: 700 }}>{message}</p>}
  </main>;
}
