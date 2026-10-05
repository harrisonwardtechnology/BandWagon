"use client";

import { useEffect, useState } from "react";
import { BRANDING_LIMITS, DEFAULT_ACCENT, DEFAULT_TAGLINE, accentColorError, safeLogoUrl } from "@/lib/branding-policy";

type Row = Record<string, any>;
type Form = { displayName: string; communityName: string; tagline: string; welcomeText: string; logoUrl: string; accentColor: string };
const EMPTY: Form = { displayName: "", communityName: "", tagline: "", welcomeText: "", logoUrl: "", accentColor: "" };

const input = { display: "block", width: "100%", padding: 12, margin: "6px 0 4px", border: "1px solid var(--line-strong)", borderRadius: 10, fontSize: 15, boxSizing: "border-box" as const };
const card = { marginTop: 20, padding: 22, border: "1px solid var(--line-2)", borderRadius: 16, background: "var(--surface)" } as const;

export default function BrandingAdmin() {
  const [organizations, setOrganizations] = useState<Row[]>([]);
  const [org, setOrg] = useState("");
  const [data, setData] = useState<Row | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  function apply(x: Row) {
    setData(x);
    const s = x.saved || {};
    setForm({ displayName: s.displayName || "", communityName: s.communityName || "", tagline: s.tagline || "", welcomeText: s.welcomeText || "", logoUrl: s.logoUrl || "", accentColor: s.accentColor || "" });
  }
  async function loadOrg(id: string) {
    setOrg(id); setData(null); setErrors({}); setMessage("");
    if (!id) return;
    const r = await fetch(`/api/admin/branding?organizationId=${encodeURIComponent(id)}`);
    const x = await r.json().catch(() => ({}));
    if (!r.ok) { setMessage(x.error || "Unable to load branding"); return; }
    apply(x);
  }
  useEffect(() => { void (async () => {
    const r = await fetch("/api/admin/branding");
    const x = await r.json().catch(() => ({}));
    if (!r.ok) { setMessage(x.error || "Unable to load organizations"); return; }
    setOrganizations(x.organizations || []);
    if (x.organizations?.length === 1) void loadOrg(x.organizations[0].id);
  })(); }, []);

  async function save() {
    setWorking(true); setMessage(""); setErrors({});
    const r = await fetch("/api/admin/branding", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organizationId: org, ...form }) });
    const x = await r.json().catch(() => ({}));
    setWorking(false);
    if (!r.ok) { setErrors(x.errors || {}); setMessage(x.error || "Unable to save branding"); return; }
    apply(x); setMessage("Saved. Your community homepage now uses this branding.");
  }

  const set = (key: keyof Form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });
  const field = (key: keyof Form, label: string, hint: string, multiline = false) => <div style={{ marginBottom: 14 }}>
    <label style={{ fontWeight: 700 }} htmlFor={`brand-${key}`}>{label}</label>
    {multiline
      ? <textarea id={`brand-${key}`} value={form[key]} onChange={set(key)} rows={4} maxLength={(BRANDING_LIMITS as any)[key]} style={input} />
      : <input id={`brand-${key}`} value={form[key]} onChange={set(key)} maxLength={(BRANDING_LIMITS as any)[key]} style={input} />}
    <div style={{ fontSize: 13, color: errors[key] ? "var(--text-danger)" : "var(--text-muted)" }}>{errors[key] || hint}</div>
  </div>;

  // Live preview uses the same rules as the server, so what you see is what saves.
  const accentOk = !form.accentColor || !accentColorError(form.accentColor.toLowerCase());
  const accent = form.accentColor && accentOk ? form.accentColor : DEFAULT_ACCENT;
  const logo = safeLogoUrl(form.logoUrl);

  return <main style={{ maxWidth: 1000, margin: "40px auto", padding: "0 20px", fontFamily: "system-ui,sans-serif", color: "var(--text)" }}>
    <section style={{ background: "var(--panel-solid)", color: "white", padding: 28, borderRadius: 22 }}>
      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1 }}>ORGANIZATION ADMIN</div>
      <h1 style={{ fontSize: 36, margin: "6px 0" }}>Branding</h1>
      <p style={{ margin: 0, opacity: .9 }}>Make your community homepage look like yours. The BandWagon safety notice and attribution always stay on the page.</p>
      <p style={{ margin: "10px 0 0" }}><a href="/admin/setup" style={{ color: "white", fontWeight: 800 }}>Back To Setup Checklist</a></p>
    </section>

    {organizations.length > 1 && <section style={card}>
      <label style={{ fontWeight: 700 }} htmlFor="brand-org">Organization</label>
      <select id="brand-org" value={org} onChange={e => void loadOrg(e.target.value)} style={input}>
        <option value="">Choose An Organization</option>
        {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </section>}

    {message && <p role="status" style={{ marginTop: 18, padding: 14, background: "var(--bg-info-2)", borderRadius: 10 }}>{message}</p>}

    {data && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 20 }}>
      <section style={card}>
        <h2 style={{ marginTop: 0 }}>Your Details</h2>
        {field("displayName", "Community Name", "Shown as the big heading, like \"FloMoGo\".")}
        {field("communityName", "Who It's For (Optional)", "For example \"Flower Mound Band Community\".")}
        {field("tagline", "Tagline (Optional)", `One short line. Leave blank for "${DEFAULT_TAGLINE}"`)}
        {field("welcomeText", "Welcome Message (Optional)", "A few sentences families see on your homepage.", true)}
        {field("logoUrl", "Logo Link (Optional)", "An https:// link to a square PNG or SVG you already host, like on your school or booster site.")}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontWeight: 700 }} htmlFor="brand-accent">Button Color (Optional)</label>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input type="color" aria-label="Pick button color" value={accent} onChange={e => setForm({ ...form, accentColor: e.target.value })} style={{ width: 52, height: 44, border: 0, background: "none" }} />
            <input id="brand-accent" value={form.accentColor} onChange={set("accentColor")} placeholder={DEFAULT_ACCENT} style={{ ...input, margin: 0 }} />
          </div>
          <div style={{ fontSize: 13, color: errors.accentColor || !accentOk ? "var(--text-danger)" : "var(--text-muted)" }}>{errors.accentColor || (!accentOk ? accentColorError(form.accentColor.toLowerCase()) : "Lighter colors work best, since button text is dark navy.")}</div>
        </div>
        <button onClick={save} disabled={working} style={{ padding: "12px 20px", border: 0, borderRadius: 10, background: "var(--btn-solid)", color: "var(--on-btn-solid)", fontWeight: 800, cursor: "pointer", opacity: working ? .6 : 1 }}>{working ? "Saving..." : "Save Branding"}</button>
      </section>

      <section style={card} aria-label="Preview">
        <h2 style={{ marginTop: 0 }}>Preview</h2>
        <div style={{ background: "var(--panel-solid)", color: "white", borderRadius: 18, padding: 24 }}>
          {logo && <img src={logo} alt="" referrerPolicy="no-referrer" style={{ width: 56, height: 56, objectFit: "contain", borderRadius: 12, background: "var(--surface)", padding: 4, marginBottom: 12 }} />}
          {form.communityName && <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, opacity: .8, textTransform: "uppercase" }}>{form.communityName}</div>}
          <div style={{ fontSize: 32, fontWeight: 900, margin: "4px 0" }}>{form.displayName || "Your community"}</div>
          <div style={{ opacity: .9 }}>{form.tagline || DEFAULT_TAGLINE}</div>
          {form.welcomeText && <p style={{ opacity: .85, lineHeight: 1.55, whiteSpace: "pre-line" }}>{form.welcomeText}</p>}
          <span style={{ display: "inline-block", marginTop: 14, padding: "10px 18px", borderRadius: 12, background: accent, color: "#071a33", fontWeight: 850 }}>Get Started</span>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Live at <code>{data.tenantHostname}</code> after you save.</p>
      </section>
    </div>}
  </main>;
}
