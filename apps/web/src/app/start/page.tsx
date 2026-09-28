"use client";

import { useEffect, useRef, useState } from "react";
import TurnstileWidget from "@/components/turnstile-widget";

type Row = Record<string, any>;

const TYPES: Array<[string, string]> = [
  ["school_band", "School band"],
  ["school_club", "School club or team"],
  ["youth_sports", "Youth sports"],
  ["faith_community", "Faith community"],
  ["scouting", "Scouting"],
  ["other", "Other"],
];
const STATUS_LABEL: Record<string, string> = { pending: "Waiting for review", approved: "Approved", rejected: "Not approved", withdrawn: "Withdrawn" };

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").replace(/-+/g, "-").slice(0, 50);
}

export default function StartCommunityPage() {
  const [loaded, setLoaded] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [meta, setMeta] = useState<Row>({ baseDomain: "bandwagon.club", turnstileRequired: false });
  const [requests, setRequests] = useState<Row[]>([]);
  const [form, setForm] = useState<Row>({ organizationName: "", slug: "", organizationType: "school_band", city: "", state: "TX", approximateFamilies: "", requesterRole: "", sponsoringOrganization: "", website: "", rideDescription: "", agreementAccepted: false });
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugCheck, setSlugCheck] = useState<Row | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [token, setToken] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const slugTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function load() {
    const r = await fetch("/api/organization-requests", { cache: "no-store" });
    const d = await r.json().catch(() => ({}));
    setMeta({ baseDomain: d.baseDomain || "bandwagon.club", turnstileRequired: Boolean(d.turnstileRequired), agreementVersion: d.agreementVersion });
    setSignedIn(r.ok && d.signedIn === true);
    setRequests(d.requests || []);
    setLoaded(true);
  }
  useEffect(() => { void load(); }, []);

  function update(key: string, value: any) {
    setForm(current => {
      const next = { ...current, [key]: value };
      if (key === "organizationName" && !slugTouched) next.slug = slugify(String(value));
      return next;
    });
  }

  useEffect(() => {
    if (!signedIn) return;
    if (slugTimer.current) clearTimeout(slugTimer.current);
    const slug = form.slug;
    if (!slug) { setSlugCheck(null); return; }
    slugTimer.current = setTimeout(async () => {
      const r = await fetch(`/api/organization-requests?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      if (r.ok) setSlugCheck(d.slugCheck || null);
    }, 350);
  }, [form.slug, signedIn]);

  async function submit() {
    setWorking(true); setMessage(""); setFields({});
    const r = await fetch("/api/organization-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "create", ...form, approximateFamilies: Number(form.approximateFamilies), turnstileToken: token }),
    });
    const d = await r.json().catch(() => ({}));
    setWorking(false); setResetKey(k => k + 1);
    if (!r.ok) { setFields(d.fields || {}); setMessage(d.error || "We could not send your request."); return; }
    setRequests(d.requests || []);
    setMessage("Thanks. Your request was sent. We will email you when it is reviewed.");
    setForm(f => ({ ...f, organizationName: "", slug: "", rideDescription: "", agreementAccepted: false }));
    setSlugTouched(false);
  }

  async function withdraw(id: string) {
    if (!confirm("Withdraw this request?")) return;
    const r = await fetch("/api/organization-requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "withdraw", requestId: id }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setMessage(d.error || "Unable to withdraw request"); return; }
    setRequests(d.requests || []);
  }

  const input = { display: "block", width: "100%", boxSizing: "border-box", padding: 11, margin: "6px 0 4px", border: "1px solid #cbd5e1", borderRadius: 8, font: "inherit" } as const;
  const card = { marginTop: 18, padding: 22, border: "1px solid #dbe3ef", borderRadius: 16, background: "white" } as const;
  const button = { padding: "12px 18px", border: 0, borderRadius: 10, background: "#101b33", color: "white", fontWeight: 800, cursor: "pointer" } as const;
  const err = (key: string) => fields[key] ? <div role="alert" style={{ color: "#b91c1c", fontSize: 14, marginBottom: 10 }}>{fields[key]}</div> : <div style={{ height: 10 }} />;
  const field = (key: string, label: string, props: Row = {}) => <label style={{ display: "block" }}><strong>{label}</strong><input value={form[key]} onChange={e => update(key, e.target.value)} style={input} aria-invalid={Boolean(fields[key])} {...props} />{err(key)}</label>;
  const hasOpen = requests.some(r => r.status === "pending");
  const slugOk = slugCheck && slugCheck.slug === form.slug && slugCheck.available;
  const canSubmit = !working && form.agreementAccepted && (!meta.turnstileRequired || token) && !(slugCheck && slugCheck.slug === form.slug && !slugCheck.available);

  return <main style={{ maxWidth: 860, margin: "40px auto", padding: "0 20px", fontFamily: "system-ui,sans-serif" }}>
    <section style={{ background: "#101b33", color: "white", padding: 28, borderRadius: 22 }}>
      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1 }}>BANDWAGON</div>
      <h1 style={{ fontSize: 38, margin: "6px 0" }}>Start A Community</h1>
      <p style={{ margin: 0, opacity: .9 }}>Bring private, parent-led carpools to your band, team, or group. BandWagon is free for organizations. We review each request before it goes live.</p>
    </section>

    {!loaded && <section style={card}><p>Loading...</p></section>}

    {loaded && !signedIn && <section style={card}>
      <h2 style={{ marginTop: 0 }}>Sign In First</h2>
      <p>You need a BandWagon account to request a community. The person who signs in becomes the first owner if it is approved.</p>
      <a href="/login" style={{ ...button, display: "inline-block", textDecoration: "none" }}>Sign In Or Create An Account</a>
      <p style={{ color: "#475569", fontSize: 14 }}>After you sign in, come back to this page.</p>
    </section>}

    {signedIn && requests.length > 0 && <section style={card}>
      <h2 style={{ marginTop: 0 }}>Your Requests</h2>
      {requests.map(r => <div key={r.id} style={{ padding: "12px 0", borderTop: "1px solid #eef2f7" }}>
        <strong>{r.organization_name}</strong> <span style={{ color: "#475569" }}>({r.requested_slug}.{meta.baseDomain})</span>
        <div style={{ marginTop: 4 }}>Status: <strong>{STATUS_LABEL[r.status] || r.status}</strong> <span style={{ color: "#64748b", fontSize: 14 }}>sent {new Date(r.created_at).toLocaleDateString()}</span></div>
        {r.status === "rejected" && r.review_notes && <p style={{ margin: "6px 0", color: "#475569" }}>Note: {r.review_notes}</p>}
        {r.status === "approved" && <p style={{ margin: "6px 0" }}><a href={`/admin/setup?organizationId=${r.organization_id}`}>Open Your Setup Checklist</a>{r.tenant_hostname && <> or visit <a href={`https://${r.tenant_hostname}`}>{r.tenant_hostname}</a></>}</p>}
        {r.status === "pending" && <button onClick={() => withdraw(r.id)} style={{ marginTop: 6 }}>Withdraw</button>}
      </div>)}
    </section>}

    {signedIn && <section style={card}>
      <h2 style={{ marginTop: 0 }}>{hasOpen ? "Request Another Community" : "Tell Us About Your Group"}</h2>
      {field("organizationName", "Organization Name", { maxLength: 120, placeholder: "Example High School Band" })}
      <label style={{ display: "block" }}><strong>Web Address</strong>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input value={form.slug} onChange={e => { setSlugTouched(true); update("slug", slugify(e.target.value)); }} style={{ ...input, flex: 1 }} maxLength={50} aria-invalid={Boolean(fields.slug)} />
          <span style={{ color: "#475569", whiteSpace: "nowrap" }}>.{meta.baseDomain}</span>
        </div>
      </label>
      <div style={{ fontSize: 14, margin: "4px 0 10px" }} aria-live="polite">
        {form.slug && <>Your address will be <code>{form.slug}.{meta.baseDomain}</code>. </>}
        {slugCheck && slugCheck.slug === form.slug && (slugOk ? <span style={{ color: "#15803d" }}>Available.</span> : <span style={{ color: "#b91c1c" }}>{slugCheck.error}</span>)}
      </div>
      {err("slug")}
      <label style={{ display: "block" }}><strong>Type Of Group</strong>
        <select value={form.organizationType} onChange={e => update("organizationType", e.target.value)} style={input}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </label>
      {err("organizationType")}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        {field("city", "City", { maxLength: 80 })}
        {field("state", "State", { maxLength: 40 })}
      </div>
      {field("approximateFamilies", "About how many families?", { type: "number", min: 1, max: 100000, inputMode: "numeric" })}
      {field("requesterRole", "Your Role", { maxLength: 120, placeholder: "Band director, booster president, coach..." })}
      {field("sponsoringOrganization", "Sponsoring School Or Parent Group (Optional)", { maxLength: 160 })}
      {field("website", "Website (Optional)", { maxLength: 300, placeholder: "example.org" })}
      <label style={{ display: "block" }}><strong>How would rides work?</strong>
        <textarea value={form.rideDescription} onChange={e => update("rideDescription", e.target.value)} rows={4} maxLength={2000} style={input} placeholder="For example: parents share rides to Saturday competitions and early practices." aria-invalid={Boolean(fields.rideDescription)} />
      </label>
      {err("rideDescription")}
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "8px 0" }}>
        <input type="checkbox" checked={form.agreementAccepted} onChange={e => update("agreementAccepted", e.target.checked)} style={{ marginTop: 4 }} />
        <span>I have read and accept the <a href="/legal/organization-agreement" target="_blank" rel="noreferrer">Organization Agreement</a> for this group, and I am allowed to ask on its behalf.</span>
      </label>
      {err("agreementAccepted")}
      {meta.turnstileRequired && <TurnstileWidget action="organization_request" onToken={setToken} resetKey={resetKey} />}
      <button onClick={submit} disabled={!canSubmit} style={{ ...button, marginTop: 12, opacity: canSubmit ? 1 : .6 }}>{working ? "Sending..." : "Send Request"}</button>
    </section>}

    {message && <p role="status" style={{ padding: 14, background: "#f8fafc", border: "1px solid #dbe3ef", borderRadius: 10 }}>{message}</p>}
  </main>;
}
