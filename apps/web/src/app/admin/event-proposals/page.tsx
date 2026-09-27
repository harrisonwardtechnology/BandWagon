"use client";

import { useEffect, useState } from "react";

type Row = Record<string, any>;

const STATUS_LABELS: Record<string, string> = {
  pending: "Waiting for review",
  changes_requested: "Changes requested",
  approved: "Approved",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

function toLocalInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function ProposalCard({ proposal, working, onAction }: { proposal: Row; working: boolean; onAction: (action: string, extra: Row) => Promise<boolean> }) {
  const [mode, setMode] = useState<"" | "approve" | "request-changes" | "decline">("");
  const [note, setNote] = useState("");
  const [title, setTitle] = useState(proposal.title || "");
  const [description, setDescription] = useState(proposal.description || "");
  const [locationName, setLocationName] = useState(proposal.location_name || "");
  const [locationAddress, setLocationAddress] = useState(proposal.location_address || "");
  const [startsAt, setStartsAt] = useState(toLocalInput(proposal.starts_at));
  const [endsAt, setEndsAt] = useState(toLocalInput(proposal.ends_at));
  const [visibility, setVisibility] = useState("organization");
  const [rideCoordinationEnabled, setRideCoordinationEnabled] = useState(true);
  const open = proposal.status === "pending" || proposal.status === "changes_requested";
  const input = { width: "100%", padding: 9, margin: "5px 0 10px", boxSizing: "border-box" as const };
  const button = { padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 8, background: "white", fontWeight: 800, cursor: "pointer" } as const;

  async function send() {
    if (!mode) return;
    const extra: Row = { proposalId: proposal.id, note };
    if (mode === "approve") {
      extra.edits = { title, description, locationName, locationAddress, startsAt: fromLocalInput(startsAt), endsAt: fromLocalInput(endsAt) };
      extra.visibility = visibility;
      extra.rideCoordinationEnabled = rideCoordinationEnabled;
    }
    const ok = await onAction(mode, extra);
    if (ok) { setMode(""); setNote(""); }
  }

  return <article style={{ padding: "16px 0", borderTop: "1px solid #e2e8f0" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div>
        <strong style={{ fontSize: 17 }}>{proposal.title}</strong>
        <div style={{ fontSize: 13, color: "#64748b", marginTop: 3 }}>
          Proposed by {proposal.proposer_name || "a former member"} on {new Date(proposal.submitted_at).toLocaleString()}
        </div>
      </div>
      <span style={{ fontSize: 13, fontWeight: 800, padding: "4px 10px", borderRadius: 999, background: proposal.status === "pending" ? "#fef3c7" : "#f1f5f9", alignSelf: "flex-start" }}>{STATUS_LABELS[proposal.status] || proposal.status}</span>
    </div>
    <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "4px 14px", margin: "12px 0", fontSize: 14 }}>
      <dt style={{ color: "#64748b" }}>When</dt><dd style={{ margin: 0 }}>{new Date(proposal.starts_at).toLocaleString()}{proposal.ends_at ? ` to ${new Date(proposal.ends_at).toLocaleString()}` : ""}</dd>
      <dt style={{ color: "#64748b" }}>Where</dt><dd style={{ margin: 0 }}>{[proposal.location_name, proposal.location_address].filter(Boolean).join(", ") || "Not given"}</dd>
      <dt style={{ color: "#64748b" }}>Expected riders</dt><dd style={{ margin: 0 }}>{proposal.expected_riders ?? "Not given"}</dd>
      {proposal.description && <><dt style={{ color: "#64748b" }}>Description</dt><dd style={{ margin: 0, whiteSpace: "pre-wrap" }}>{proposal.description}</dd></>}
      {proposal.notes && <><dt style={{ color: "#64748b" }}>Notes for organizers</dt><dd style={{ margin: 0, whiteSpace: "pre-wrap" }}>{proposal.notes}</dd></>}
      {proposal.moderator_note && <><dt style={{ color: "#64748b" }}>Organizer note</dt><dd style={{ margin: 0, whiteSpace: "pre-wrap" }}>{proposal.moderator_note}{proposal.decided_by_name ? ` (${proposal.decided_by_name})` : ""}</dd></>}
    </dl>
    {open && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {proposal.status === "pending" && <button style={{ ...button, borderColor: "#16a34a" }} disabled={working} onClick={() => setMode(mode === "approve" ? "" : "approve")}>Review and Approve</button>}
      {proposal.status === "pending" && <button style={button} disabled={working} onClick={() => setMode(mode === "request-changes" ? "" : "request-changes")}>Ask for Changes</button>}
      <button style={{ ...button, borderColor: "#dc2626" }} disabled={working} onClick={() => setMode(mode === "decline" ? "" : "decline")}>Decline</button>
    </div>}
    {mode === "approve" && <div style={{ marginTop: 12, padding: 14, background: "#f8fafc", borderRadius: 12 }}>
      <p style={{ marginTop: 0, color: "#475569" }}>Check the details below. You can fix anything before publishing. The event will be created like any other manual event, and the proposer will be credited.</p>
      <label><strong>Event name</strong><input value={title} onChange={e => setTitle(e.target.value)} style={input} maxLength={120} /></label>
      <label><strong>Description</strong><textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} style={input} maxLength={2000} /></label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
        <label><strong>Starts</strong><input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} style={input} /></label>
        <label><strong>Ends</strong><input type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} style={input} /></label>
        <label><strong>Location name</strong><input value={locationName} onChange={e => setLocationName(e.target.value)} style={input} maxLength={160} /></label>
        <label><strong>Address</strong><input value={locationAddress} onChange={e => setLocationAddress(e.target.value)} style={input} maxLength={300} /></label>
      </div>
      <p style={{ fontSize: 13, color: "#92400e", marginTop: 0 }}>Everyone who can see this event will see its address. Make sure it is a public place and not a family home.</p>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <label><input type="checkbox" checked={rideCoordinationEnabled} onChange={e => setRideCoordinationEnabled(e.target.checked)} /> Allow ride requests for this event</label>
        <label><strong>Who can see it </strong><select value={visibility} onChange={e => setVisibility(e.target.value)}><option value="organization">Everyone in the organization</option><option value="private">Organizers only</option></select></label>
      </div>
      <label><strong>Note to the proposer (optional)</strong><textarea value={note} onChange={e => setNote(e.target.value)} rows={2} style={input} maxLength={1000} /></label>
      <button style={{ ...button, background: "#16a34a", color: "white", borderColor: "#16a34a" }} disabled={working || !title.trim() || !startsAt} onClick={() => void send()}>Approve and Publish</button>
    </div>}
    {(mode === "request-changes" || mode === "decline") && <div style={{ marginTop: 12, padding: 14, background: "#f8fafc", borderRadius: 12 }}>
      <label><strong>{mode === "decline" ? "Reason for declining" : "What should the proposer change?"}</strong><textarea value={note} onChange={e => setNote(e.target.value)} rows={3} style={input} maxLength={1000} placeholder={mode === "decline" ? "For example: We already have an event that day." : "For example: Please add an end time and the field number."} /></label>
      <p style={{ fontSize: 13, color: "#64748b", marginTop: 0 }}>The proposer will see this note.</p>
      <button style={button} disabled={working || !note.trim()} onClick={() => void send()}>{mode === "decline" ? "Decline Proposal" : "Send Change Request"}</button>
    </div>}
  </article>;
}

export default function EventProposalsAdminPage() {
  const [organizationId, setOrganizationId] = useState("");
  const [organizations, setOrganizations] = useState<Row[]>([]);
  const [settings, setSettings] = useState<Row | null>(null);
  const [proposals, setProposals] = useState<Row[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [platformAccess, setPlatformAccess] = useState(false);
  const [status, setStatus] = useState("open");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  async function load(orgId = organizationId, statusFilter = status) {
    const params = new URLSearchParams();
    if (orgId) { params.set("organizationId", orgId); params.set("status", statusFilter); }
    const response = await fetch(`/api/admin/event-proposals?${params}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { window.location.href = "/login"; return; }
    if (!response.ok) { setMessage(data.error || "Unable to load event proposals"); return; }
    setOrganizations(data.organizations || []);
    setSettings(data.settings || null);
    setProposals(data.proposals || []);
    setRole(data.role || null);
    setPlatformAccess(Boolean(data.platformAccess));
    if (!orgId && data.organizations?.[0]) {
      setOrganizationId(data.organizations[0].id);
      void load(data.organizations[0].id, statusFilter);
    }
  }

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("organizationId") || "";
    if (fromUrl) setOrganizationId(fromUrl);
    void load(fromUrl);
  }, []);

  async function post(action: string, extra: Row) {
    setWorking(true);
    const response = await fetch("/api/admin/event-proposals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, organizationId, ...extra }) });
    const data = await response.json().catch(() => ({}));
    setWorking(false);
    if (!response.ok) { setMessage(data.error || "That did not work. Please try again."); return false; }
    setMessage({
      "update-settings": "Event proposal settings saved.",
      approve: "Approved. The event is now published.",
      "request-changes": "Change request sent to the proposer.",
      decline: "Proposal declined. The proposer has been told.",
    }[action] || "Saved.");
    await load();
    return true;
  }

  const card = { marginTop: 18, padding: 20, border: "1px solid #dbe3ef", borderRadius: 16, background: "white" } as const;
  const input = { width: "100%", padding: 10, margin: "6px 0 12px", boxSizing: "border-box" as const };
  const button = { padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: 8, background: "white", fontWeight: 800, cursor: "pointer" } as const;
  const canChangeSettings = platformAccess || role === "owner" || role === "admin";

  return <main style={{ maxWidth: 1040, margin: "36px auto", padding: "0 20px", fontFamily: "system-ui,sans-serif", background: "#f8fafc" }}>
    <header style={{ background: "#101b33", color: "white", padding: 28, borderRadius: 22 }}>
      <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1 }}>ORGANIZATION ADMIN</div>
      <h1 style={{ margin: "6px 0" }}>Event Proposals</h1>
      <p style={{ marginBottom: 0, opacity: .9 }}>Members can suggest events. Nothing is published until an organizer approves it.</p>
    </header>
    <section style={card}>
      <label><strong>Organization</strong><select value={organizationId} onChange={e => { setOrganizationId(e.target.value); void load(e.target.value); }} style={input}><option value="">Select organization</option>{organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
      <a href="/admin/events" style={{ ...button, textDecoration: "none", color: "#101b33", display: "inline-block" }}>Back to Events</a>
    </section>
    {settings && <section style={card}>
      <h2 style={{ marginTop: 0 }}>Proposal Settings</h2>
      <p style={{ color: "#64748b" }}>This feature is off unless you turn it on. Students and other minors can never send proposals.</p>
      <label style={{ display: "flex", gap: 10, margin: "10px 0" }}><input type="checkbox" checked={settings.enabled} disabled={!canChangeSettings} onChange={e => setSettings({ ...settings, enabled: e.target.checked })} />Let members propose events</label>
      <label><strong>Who can propose</strong><select value={settings.proposerScope} disabled={!canChangeSettings} onChange={e => setSettings({ ...settings, proposerScope: e.target.value })} style={input}><option value="adult_members">Any adult member</option><option value="guardians_only">Only parents and guardians of students in this organization</option></select></label>
      {canChangeSettings
        ? <button style={button} disabled={working} onClick={() => void post("update-settings", { enabled: settings.enabled, proposerScope: settings.proposerScope })}>Save Settings</button>
        : <p style={{ fontSize: 13, color: "#64748b" }}>Only organization owners and admins can change these settings. Managers can still review proposals.</p>}
    </section>}
    {message && <p style={{ ...card, background: "#eef2ff", fontWeight: 750 }}>{message}</p>}
    {organizationId && <section style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Review Queue</h2>
        <label>Show <select value={status} onChange={e => { setStatus(e.target.value); void load(organizationId, e.target.value); }}>
          <option value="open">Needs a decision</option>
          <option value="approved">Approved</option>
          <option value="declined">Declined</option>
          <option value="withdrawn">Withdrawn</option>
          <option value="all">All</option>
        </select></label>
      </div>
      {proposals.length === 0 ? <p style={{ color: "#64748b" }}>No proposals here right now.</p> : proposals.map(proposal => <ProposalCard key={`${proposal.id}:${proposal.updated_at}`} proposal={proposal} working={working} onAction={post} />)}
    </section>}
  </main>;
}
