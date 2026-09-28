"use client";

import { useEffect, useState } from "react";

// Submitted text is rendered as plain text only. Links are never made clickable.

type Row = Record<string, any>;

export default function FeatureRequestsAdmin() {
  const [requests, setRequests] = useState<Row[]>([]);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("votes");
  const [openId, setOpenId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { status: string; note: string; duplicateOfId: string }>>({});
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  async function load(next = { status, category, sort }) {
    const params = new URLSearchParams({ sort: next.sort });
    if (next.status) params.set("status", next.status);
    if (next.category) params.set("category", next.category);
    const r = await fetch(`/api/admin/feature-requests?${params}`, { cache: "no-store" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setMessage(d.error || "Platform administrator access is required."); return; }
    setRequests(d.requests || []); setStatuses(d.statuses || {}); setCategories(d.categories || {});
  }
  useEffect(() => { void load({ status, category, sort }); }, [status, category, sort]);

  function draftFor(r: Row) { return drafts[r.id] || { status: r.status, note: r.public_note || "", duplicateOfId: r.duplicate_of_id || "" }; }
  function setDraft(r: Row, patch: Partial<{ status: string; note: string; duplicateOfId: string }>) { setDrafts((all) => ({ ...all, [r.id]: { ...draftFor(r), ...patch } })); }

  async function save(r: Row) {
    const d = draftFor(r);
    if (d.status === "duplicate" && !d.duplicateOfId) { setMessage("Choose the original idea before marking this one as a duplicate."); return; }
    setWorking(true); setMessage("");
    const res = await fetch("/api/admin/feature-requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestId: r.id, status: d.status, publicNote: d.note, duplicateOfId: d.status === "duplicate" ? d.duplicateOfId : null }) });
    const x = await res.json().catch(() => ({}));
    setWorking(false);
    if (!res.ok) { setMessage(x.error || "Unable to save."); return; }
    setMessage(`Saved. Status is now ${x.statusLabel}.${x.emailSent ? " The submitter was emailed." : ""}`);
    setDrafts((all) => { const copy = { ...all }; delete copy[r.id]; return copy; });
    await load();
  }

  const card = { marginTop: 14, padding: 18, border: "1px solid #dbe3ef", borderRadius: 16, background: "white" } as const;
  const control = { padding: 8, borderRadius: 8, border: "1px solid #cbd5e1", font: "inherit" } as const;
  const button = { padding: "10px 14px", border: 0, borderRadius: 9, background: "#101b33", color: "white", fontWeight: 800, cursor: "pointer" } as const;
  const originals = requests.filter((r) => r.status !== "duplicate");

  return <main style={{ maxWidth: 1050, margin: "40px auto", padding: "0 20px", fontFamily: "system-ui,sans-serif" }}>
    <section style={{ background: "#101b33", color: "white", padding: 28, borderRadius: 22 }}>
      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1 }}>PLATFORM ADMIN</div>
      <h1 style={{ fontSize: 38, margin: "6px 0" }}>Feature Requests</h1>
      <p style={{ margin: 0, opacity: .9 }}>Review ideas, set their status, and leave a public note. New ideas stay private to the submitter until you move them to Under review or later.</p>
      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <a href="/admin/platform" style={{ color: "white", border: "1px solid #64748b", padding: "8px 12px", borderRadius: 9, fontWeight: 800, textDecoration: "none" }}>Platform Overview</a>
        <a href="/help/ideas" style={{ color: "white", border: "1px solid #64748b", padding: "8px 12px", borderRadius: 9, fontWeight: 800, textDecoration: "none" }}>Public Ideas Page</a>
      </div>
    </section>

    <section style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16, alignItems: "center" }}>
      <label>Status <select value={status} onChange={(e) => setStatus(e.target.value)} style={control}><option value="">All</option>{Object.entries(statuses).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label>Category <select value={category} onChange={(e) => setCategory(e.target.value)} style={control}><option value="">All</option>{Object.entries(categories).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label>Sort <select value={sort} onChange={(e) => setSort(e.target.value)} style={control}><option value="votes">Most Votes</option><option value="newest">Newest</option></select></label>
      <span style={{ color: "#64748b" }}>{requests.length} shown</span>
    </section>

    {message && <p role="status" style={{ padding: 14, background: "#f8fafc", border: "1px solid #dbe3ef", borderRadius: 10 }}>{message}</p>}
    {requests.length === 0 && <section style={card}><p style={{ margin: 0 }}>No ideas match these filters.</p></section>}

    {requests.map((r) => {
      const open = openId === r.id;
      const d = draftFor(r);
      const options = [r.status, ...(r.next_statuses || [])].filter((v, i, all) => all.indexOf(v) === i);
      return <section key={r.id} style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 20, overflowWrap: "anywhere" }}>{r.title}</h2>
            <div style={{ color: "#475569", fontSize: 14, marginTop: 4 }}>
              <strong>{statuses[r.status] || r.status}</strong> · {categories[r.category] || r.category} · {r.vote_count} vote{Number(r.vote_count) === 1 ? "" : "s"} · sent {new Date(r.created_at).toLocaleString()}
            </div>
          </div>
          <button onClick={() => setOpenId(open ? "" : r.id)} style={{ alignSelf: "flex-start" }}>{open ? "Hide" : "Review"}</button>
        </div>
        {open && <div style={{ marginTop: 12 }}>
          <div style={{ padding: 12, background: "#f8fafc", borderRadius: 10, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{r.details}</div>
          <div style={{ fontSize: 14, color: "#475569", marginTop: 8 }}>
            Submitted by {r.submitter_name || "someone who was not signed in"}{r.submitter_email ? ` (${r.submitter_email})` : ""}{r.organization_name ? ` from ${r.organization_name}` : ""}.
            {r.status_changed_at && <> Last status change {new Date(r.status_changed_at).toLocaleString()}{r.status_changed_by_name ? ` by ${r.status_changed_by_name}` : ""}.</>}
            {r.duplicate_of_title && <> Duplicate of <strong>{r.duplicate_of_title}</strong>.</>}
          </div>
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            <label><strong>Status</strong><br /><select value={d.status} onChange={(e) => setDraft(r, { status: e.target.value })} style={control}>{options.map((v: string) => <option key={v} value={v}>{statuses[v] || v}</option>)}</select></label>
            {d.status === "duplicate" && <label><strong>Duplicate Of</strong><br />
              <select value={d.duplicateOfId} onChange={(e) => setDraft(r, { duplicateOfId: e.target.value })} style={{ ...control, maxWidth: "100%" }}>
                <option value="">Choose The Original Idea</option>
                {originals.filter((o) => o.id !== r.id).map((o) => <option key={o.id} value={o.id}>{o.title.slice(0, 90)} ({statuses[o.status] || o.status})</option>)}
              </select>
              <span style={{ display: "block", fontSize: 13, color: "#64748b", marginTop: 4 }}>Votes move to the original idea. Only ideas in the current list appear here, so clear the filters if you cannot find it.</span>
            </label>}
            <label><strong>Public Note</strong> <span style={{ color: "#64748b" }}>(shown to everyone who can see this idea)</span>
              <textarea value={d.note} onChange={(e) => setDraft(r, { note: e.target.value })} rows={3} maxLength={1000} style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 10, marginTop: 6, border: "1px solid #cbd5e1", borderRadius: 8, font: "inherit" }} />
            </label>
            <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>Moving an idea to Planned, Shipped, or Not planned emails the submitter when we have a verified address.</p>
            <button disabled={working} onClick={() => save(r)} style={{ ...button, justifySelf: "start", opacity: working ? .6 : 1 }}>Save Changes</button>
          </div>
        </div>}
      </section>;
    })}
  </main>;
}
