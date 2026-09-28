"use client";

import { useEffect, useState } from "react";

type Row = Record<string, any>;
const FILTERS: Array<[string, string]> = [["pending", "Waiting"], ["approved", "Approved"], ["rejected", "Not approved"], ["withdrawn", "Withdrawn"], ["", "All"]];

export default function OrganizationRequestsAdmin() {
  const [requests, setRequests] = useState<Row[]>([]);
  const [checklist, setChecklist] = useState<Array<{ key: string; label: string }>>([]);
  const [types, setTypes] = useState<Record<string, string>>({});
  const [canDecide, setCanDecide] = useState(false);
  const [filter, setFilter] = useState("pending");
  const [openId, setOpenId] = useState("");
  const [ticks, setTicks] = useState<Record<string, Record<string, boolean>>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  async function load(status = filter) {
    const r = await fetch(`/api/admin/organization-requests${status ? `?status=${status}` : ""}`, { cache: "no-store" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setMessage(d.error || "Platform administrator access is required."); return; }
    setRequests(d.requests || []); setChecklist(d.checklist || []); setTypes(d.organizationTypes || {}); setCanDecide(Boolean(d.canDecide));
  }
  useEffect(() => { void load(filter); }, [filter]);

  async function decide(request: Row, action: "approve" | "reject") {
    const note = notes[request.id] || "";
    if (action === "reject" && !note.trim()) { setMessage("Add a note for the requester before you reject."); return; }
    if (!confirm(action === "approve" ? `Create ${request.organization_name} and make the requester its owner?` : `Reject ${request.organization_name}?`)) return;
    setWorking(true); setMessage("");
    const r = await fetch("/api/admin/organization-requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, requestId: request.id, note, checklist: ticks[request.id] || {} }) });
    const d = await r.json().catch(() => ({}));
    setWorking(false);
    if (!r.ok) { setMessage(d.error || "Unable to save decision"); return; }
    setMessage(action === "approve"
      ? `Approved. ${d.organization?.tenant_hostname || "The organization"} is live.${d.emailSent ? " The requester was emailed." : " Email could not be sent, so let the requester know."}`
      : `Rejected.${d.emailSent ? " The requester was emailed." : " Email could not be sent, so let the requester know."}`);
    setOpenId("");
    await load();
  }

  const card = { marginTop: 16, padding: 20, border: "1px solid #dbe3ef", borderRadius: 16, background: "white" } as const;
  const button = { padding: "10px 14px", border: 0, borderRadius: 9, background: "#101b33", color: "white", fontWeight: 800, cursor: "pointer" } as const;
  const dl = (label: string, value: any) => value ? <div style={{ margin: "4px 0" }}><span style={{ color: "#64748b" }}>{label}:</span> {value}</div> : null;

  return <main style={{ maxWidth: 1050, margin: "40px auto", padding: "0 20px", fontFamily: "system-ui,sans-serif" }}>
    <section style={{ background: "#101b33", color: "white", padding: 28, borderRadius: 22 }}>
      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1 }}>PLATFORM ADMIN</div>
      <h1 style={{ fontSize: 38, margin: "6px 0" }}>Community Requests</h1>
      <p style={{ margin: 0, opacity: .9 }}>Review new organizations before they go live. Approving creates the tenant and makes the requester its owner.</p>
      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <a href="/admin/platform" style={{ color: "white", border: "1px solid #64748b", padding: "8px 12px", borderRadius: 9, fontWeight: 800, textDecoration: "none" }}>Platform Overview</a>
        <a href="/admin/tenants" style={{ color: "white", border: "1px solid #64748b", padding: "8px 12px", borderRadius: 9, fontWeight: 800, textDecoration: "none" }}>SaaS Tenants</a>
      </div>
    </section>

    <section style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
      {FILTERS.map(([value, label]) => <button key={value || "all"} onClick={() => setFilter(value)} style={{ padding: "8px 12px", borderRadius: 999, border: "1px solid #cbd5e1", background: filter === value ? "#101b33" : "white", color: filter === value ? "white" : "#101b33", fontWeight: 700 }}>{label}</button>)}
    </section>
    {!canDecide && requests.length > 0 && <p style={{ color: "#475569" }}>You can view requests. Only a platform owner can approve or reject.</p>}

    {requests.length === 0 && !message && <section style={card}><p style={{ margin: 0 }}>No requests here.</p></section>}

    {requests.map(r => {
      const open = openId === r.id;
      const t = ticks[r.id] || {};
      const allTicked = checklist.every(item => t[item.key]);
      return <section key={r.id} style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22 }}>{r.organization_name}</h2>
            <div style={{ color: "#475569" }}>{types[r.organization_type] || r.organization_type} in {r.city}, {r.state} · about {r.approximate_families} families</div>
            <div style={{ color: "#475569", fontSize: 14 }}>Sent {new Date(r.created_at).toLocaleString()} · status <strong>{r.status}</strong></div>
          </div>
          <button onClick={() => setOpenId(open ? "" : r.id)} style={{ alignSelf: "flex-start" }}>{open ? "Hide Details" : "Review"}</button>
        </div>
        {open && <div style={{ marginTop: 14 }}>
          {dl("Requested Address", <code>{r.requested_slug}</code>)}
          {dl("Requester", `${r.requester_name}${r.requester_email ? ` <${r.requester_email}>` : ""}`)}
          {dl("Account Type", r.requester_person_type==="adult"?"Adult":"Not an adult account (cannot be approved)")}
          {dl("Role", r.requester_role)}
          {dl("Sponsor", r.sponsoring_organization)}
          {dl("Website", r.website && <a href={r.website} target="_blank" rel="noreferrer noopener">{r.website}</a>)}
          {dl("Agreement", `${r.agreement_version}, accepted ${new Date(r.agreement_accepted_at).toLocaleString()}`)}
          <div style={{ margin: "10px 0", padding: 12, background: "#f8fafc", borderRadius: 10, whiteSpace: "pre-wrap" }}>{r.ride_description}</div>
          {r.status !== "pending" && <>
            {dl("Reviewed By", r.reviewer_name)}
            {dl("Decided", r.decided_at && new Date(r.decided_at).toLocaleString())}
            {dl("Note", r.review_notes)}
            {dl("Tenant", r.tenant_hostname && <code>{r.tenant_hostname}</code>)}
          </>}
          {r.status === "pending" && <>
            <h3 style={{ marginBottom: 6 }}>Review Checklist</h3>
            <p style={{ margin: "0 0 8px", color: "#475569", fontSize: 14 }}>From the Organization Review Guide. Tick every item to approve.</p>
            {checklist.map(item => <label key={item.key} style={{ display: "flex", gap: 8, margin: "6px 0" }}>
              <input type="checkbox" disabled={!canDecide} checked={Boolean(t[item.key])} onChange={e => setTicks(all => ({ ...all, [r.id]: { ...(all[r.id] || {}), [item.key]: e.target.checked } }))} />
              <span>{item.label}</span>
            </label>)}
            <label style={{ display: "block", marginTop: 10 }}><strong>Note To The Requester</strong> <span style={{ color: "#64748b" }}>(required to reject)</span>
              <textarea value={notes[r.id] || ""} disabled={!canDecide} onChange={e => setNotes(all => ({ ...all, [r.id]: e.target.value }))} rows={3} maxLength={2000} style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 10, marginTop: 6, border: "1px solid #cbd5e1", borderRadius: 8, font: "inherit" }} />
            </label>
            {canDecide && <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button disabled={working || !allTicked} onClick={() => decide(r, "approve")} style={{ ...button, opacity: working || !allTicked ? .6 : 1 }}>Approve And Create</button>
              <button disabled={working} onClick={() => decide(r, "reject")} style={{ ...button, background: "#b91c1c" }}>Reject</button>
            </div>}
          </>}
        </div>}
      </section>;
    })}

    {message && <p role="status" style={{ padding: 14, background: "#f8fafc", border: "1px solid #dbe3ef", borderRadius: 10 }}>{message}</p>}
  </main>;
}
