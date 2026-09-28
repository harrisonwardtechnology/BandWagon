"use client";

import { useEffect, useState } from "react";
import { AppNav, appCardStyle, appPageStyle } from "@/components/app-nav";

type Row = Record<string, any>;

const STATUS_LABELS: Record<string, string> = {
  pending: "Waiting for review",
  changes_requested: "Changes requested",
  approved: "Approved and published",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

const EMPTY = { title: "", description: "", locationName: "", locationAddress: "", startsAt: "", endsAt: "", expectedRiders: "", notes: "" };

function toLocalInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function EventProposalsPage() {
  const [organizations, setOrganizations] = useState<Row[]>([]);
  const [proposals, setProposals] = useState<Row[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [loaded, setLoaded] = useState(false);

  function apply(data: Row) {
    const orgs = data.organizations || [];
    setOrganizations(orgs);
    setProposals(data.proposals || []);
    setOrganizationId(current => current || orgs.find((o: Row) => o.canPropose)?.id || orgs[0]?.id || "");
  }

  async function load() {
    const response = await fetch("/api/event-proposals", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { window.location.href = "/login"; return; }
    if (!response.ok) { setMessage(data.error || "Unable to load event proposals"); return; }
    apply(data);
    setLoaded(true);
  }

  useEffect(() => { void load(); }, []);

  async function post(body: Row, success: string) {
    setWorking(true);
    const response = await fetch("/api/event-proposals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    setWorking(false);
    if (!response.ok) { setMessage(data.error || "That did not work. Please try again."); return false; }
    apply(data);
    setMessage(success);
    return true;
  }

  async function submit() {
    const payload = {
      ...form,
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      expectedRiders: form.expectedRiders === "" ? null : Number(form.expectedRiders),
    };
    const ok = editingId
      ? await post({ action: "resubmit", proposalId: editingId, ...payload }, "Thanks. Your updated proposal was sent back to the organizers.")
      : await post({ action: "submit", organizationId, ...payload }, "Thanks. Your proposal was sent to the organizers. You will get a notice when they decide.");
    if (ok) { setForm(EMPTY); setEditingId(null); }
  }

  function startEdit(proposal: Row) {
    setEditingId(proposal.id);
    setOrganizationId(proposal.organization_id);
    setForm({
      title: proposal.title || "",
      description: proposal.description || "",
      locationName: proposal.location_name || "",
      locationAddress: proposal.location_address || "",
      startsAt: toLocalInput(proposal.starts_at),
      endsAt: toLocalInput(proposal.ends_at),
      expectedRiders: proposal.expected_riders == null ? "" : String(proposal.expected_riders),
      notes: proposal.notes || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function withdraw(proposal: Row) {
    if (!window.confirm(`Withdraw "${proposal.title}"? Organizers will no longer see it in their queue.`)) return;
    await post({ action: "withdraw", proposalId: proposal.id }, "Proposal withdrawn.");
  }

  const selected = organizations.find(o => o.id === organizationId);
  const canSend = editingId ? true : Boolean(selected?.canPropose);
  const input = { width: "100%", padding: 10, margin: "6px 0 12px", boxSizing: "border-box" as const, border: "1px solid #cbd5e1", borderRadius: 8 };
  const button = { padding: "10px 14px", border: "1px solid #cbd5e1", borderRadius: 9, background: "white", fontWeight: 800, cursor: "pointer" } as const;
  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  return <main style={appPageStyle}><AppNav active="Propose Event" />
    <section style={{ ...appCardStyle, marginBottom: 18 }}>
      <h1 style={{ marginTop: 0 }}>{editingId ? "Update Your Event Proposal" : "Propose An Event"}</h1>
      <p style={{ color: "#475569", lineHeight: 1.6 }}>Have an event that needs carpools? Send the details to your organizers. They will review it, and it only goes on the calendar if they approve it.</p>
      {!loaded ? <p>Loading...</p> : organizations.length === 0 ? <p>Join an organization first. Then you can propose events if it allows it.</p> : <>
        <label><strong>Organization</strong><select value={organizationId} disabled={Boolean(editingId)} onChange={e => setOrganizationId(e.target.value)} style={input}>{organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
        {!editingId && selected && !selected.canPropose && <p style={{ padding: 12, borderRadius: 10, background: "#f1f5f9" }}>{selected.reason}.</p>}
        {canSend && <>
          <label><strong>Event Name</strong><input value={form.title} onChange={set("title")} maxLength={120} placeholder="Saturday section practice" style={input} /></label>
          <label><strong>Description</strong><textarea value={form.description} onChange={set("description")} maxLength={2000} rows={3} style={input} placeholder="What is it and who is it for?" /></label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            <label><strong>Starts</strong><input type="datetime-local" value={form.startsAt} onChange={set("startsAt")} style={input} /></label>
            <label><strong>Ends (Optional)</strong><input type="datetime-local" value={form.endsAt} onChange={set("endsAt")} style={input} /></label>
            <label><strong>Location Name</strong><input value={form.locationName} onChange={set("locationName")} maxLength={160} placeholder="Community Center" style={input} /></label>
            <label><strong>Address</strong><input value={form.locationAddress} onChange={set("locationAddress")} maxLength={300} placeholder="Event address" style={input} /></label>
          </div>
          <p style={{ fontSize: 13, color: "#92400e", marginTop: 0 }}>If approved, everyone who can see the event will see this address. Use a public place such as a school, field, or park. Do not enter a home address. Pickup spots stay private and are set when someone requests a ride.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            <label><strong>About how many riders?</strong><input type="number" min={0} max={500} value={form.expectedRiders} onChange={set("expectedRiders")} style={input} /></label>
          </div>
          <label><strong>Notes For Organizers (Optional)</strong><textarea value={form.notes} onChange={set("notes")} maxLength={1000} rows={2} style={input} placeholder="Anything organizers should know. Only organizers see this." /></label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={{ ...button, background: "#101b33", color: "white", borderColor: "#101b33" }} disabled={working || !form.title.trim() || !form.startsAt || (!editingId && !organizationId)} onClick={() => void submit()}>{editingId ? "Send Updated Proposal" : "Send Proposal"}</button>
            {editingId && <button style={button} disabled={working} onClick={() => { setEditingId(null); setForm(EMPTY); }}>Cancel</button>}
          </div>
        </>}
      </>}
    </section>
    <section style={appCardStyle}>
      <h2 style={{ marginTop: 0 }}>Your Proposals</h2>
      {proposals.length === 0 ? <p style={{ color: "#64748b" }}>You have not proposed any events yet.</p> : proposals.map(p => <div key={p.id} style={{ padding: "14px 0", borderTop: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div><strong>{p.title}</strong><div style={{ fontSize: 13, color: "#64748b", marginTop: 3 }}>{p.organization_name} · {new Date(p.starts_at).toLocaleString()}</div></div>
          <span style={{ fontSize: 13, fontWeight: 800, padding: "4px 10px", borderRadius: 999, background: p.status === "approved" ? "#dcfce7" : p.status === "changes_requested" ? "#fef3c7" : "#f1f5f9", alignSelf: "flex-start" }}>{STATUS_LABELS[p.status] || p.status}</span>
        </div>
        {p.moderator_note && <p style={{ margin: "8px 0", padding: 10, borderRadius: 8, background: "#f8fafc", whiteSpace: "pre-wrap" }}><strong>Organizer note: </strong>{p.moderator_note}</p>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {p.status === "changes_requested" && <button style={button} disabled={working} onClick={() => startEdit(p)}>Update And Resend</button>}
          {(p.status === "pending" || p.status === "changes_requested") && <button style={button} disabled={working} onClick={() => void withdraw(p)}>Withdraw</button>}
        </div>
      </div>)}
    </section>
    {message && <div role="status" style={{ position: "fixed", right: 20, bottom: 20, maxWidth: 520, padding: 14, borderRadius: 12, background: "#101b33", color: "white" }}>{message}</div>}
  </main>;
}
