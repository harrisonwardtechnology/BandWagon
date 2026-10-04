"use client";

import { Check } from "lucide-react";
import { useEffect, useState } from "react";

type Row = Record<string, any>;
const STATE_LABEL: Record<string, string> = { active: "Waiting", accepted: "Accepted", revoked: "Canceled", expired: "Expired" };

export default function OrganizationSetupPage() {
  const [organizations, setOrganizations] = useState<Row[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [checklist, setChecklist] = useState<Row | null>(null);
  const [invites, setInvites] = useState<Row[]>([]);
  const [invitableRoles, setInvitableRoles] = useState<string[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("admin");
  const [inviteLink, setInviteLink] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [message, setMessage] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [working, setWorking] = useState(false);

  async function loadInvites(id: string) {
    const r = await fetch(`/api/admin/organization-invitations?organizationId=${encodeURIComponent(id)}`, { cache: "no-store" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return;
    setInvites(d.invitations || []);
    setInvitableRoles(d.invitableRoles || []);
    if (d.invitableRoles?.length && !d.invitableRoles.includes(inviteRole)) setInviteRole(d.invitableRoles[0]);
  }

  async function load(id = organizationId) {
    const r = await fetch(`/api/admin/setup${id ? `?organizationId=${encodeURIComponent(id)}` : ""}`, { cache: "no-store" });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { setNeedsSignIn(true); return; }
    if (!r.ok) { setMessage(d.error || "Unable to load the setup checklist"); return; }
    setOrganizations(d.organizations || []);
    setChecklist(d.checklist || null);
    if (d.organizationId) { setOrganizationId(d.organizationId); void loadInvites(d.organizationId); }
  }

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("organizationId") || "";
    if (id) setOrganizationId(id);
    void load(id);
  }, []);

  function choose(id: string) {
    setOrganizationId(id); setChecklist(null); setInvites([]); setJoinCode(""); setInviteLink(""); setMessage("");
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("organizationId", id); else url.searchParams.delete("organizationId");
    window.history.replaceState(null, "", url.toString());
    if (id) void load(id);
  }

  async function post(url: string, body: Row) {
    setWorking(true); setMessage("");
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organizationId, ...body }) });
    const d = await r.json().catch(() => ({}));
    setWorking(false);
    if (!r.ok) { setMessage(d.error || "Something went wrong"); return null; }
    return d;
  }

  async function mark(itemKey: string, done: boolean) {
    const d = await post("/api/admin/setup", { action: "mark", itemKey, done });
    if (d) setChecklist(d.checklist);
  }

  async function makeJoinCode() {
    const d = await post("/api/admin/setup", { action: "create_join_code", label: "Main join code" });
    if (d) { setJoinCode(d.code); setChecklist(d.checklist); }
  }

  async function invite() {
    setInviteLink("");
    const d = await post("/api/admin/organization-invitations", { action: "create", email: inviteEmail, role: inviteRole });
    if (!d) return;
    setInviteEmail("");
    if (d.emailSent) setMessage("Invitation sent.");
    else { setInviteLink(d.inviteUrl || ""); setMessage("Email is not set up, so share the link below with them directly."); }
    await Promise.all([loadInvites(organizationId), load(organizationId)]);
  }

  async function revoke(id: string) {
    if (!confirm("Cancel this invitation?")) return;
    const d = await post("/api/admin/organization-invitations", { action: "revoke", invitationId: id });
    if (d) await loadInvites(organizationId);
  }

  const card = { marginTop: 18, padding: 22, border: "1px solid var(--line-2)", borderRadius: 16, background: "var(--surface)" } as const;
  const button = { padding: "10px 14px", border: 0, borderRadius: 9, background: "var(--btn-solid)", color: "var(--on-btn-solid)", fontWeight: 800, cursor: "pointer" } as const;
  const input = { padding: 10, border: "1px solid var(--line-strong)", borderRadius: 8, font: "inherit" } as const;
  const progress = checklist?.progress;
  const org = checklist?.organization;

  return <main style={{ maxWidth: 960, margin: "40px auto", padding: "0 20px", fontFamily: "system-ui,sans-serif" }}>
    <section style={{ background: "var(--panel-solid)", color: "white", padding: 28, borderRadius: 22 }}>
      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1 }}>ORGANIZATION ADMIN</div>
      <h1 style={{ fontSize: 38, margin: "6px 0" }}>Setup Checklist</h1>
      <p style={{ margin: 0, opacity: .9 }}>A few steps to get your community ready before you invite families.</p>
    </section>

    {needsSignIn && <section style={card}><p style={{ marginTop: 0 }}>Sign in to see your setup checklist.</p><a href="/login" style={{ ...button, display: "inline-block", textDecoration: "none" }}>Sign In</a></section>}

    {organizations.length > 1 && <section style={card}>
      <label><strong>Organization</strong>
        <select value={organizationId} onChange={e => choose(e.target.value)} style={{ ...input, display: "block", width: "100%", marginTop: 6 }}>
          <option value="">Choose An Organization</option>
          {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </label>
    </section>}

    {!needsSignIn && organizations.length === 0 && !message && <section style={card}><p style={{ margin: 0 }}>You do not manage any organizations yet. Want to start one? <a href="/start">Start A Community</a>.</p></section>}

    {checklist && progress && <>
      <section style={card}>
        <h2 style={{ margin: 0 }}>{org?.name}</h2>
        {org?.tenant_hostname && <p style={{ margin: "4px 0 12px", color: "var(--text-3)" }}>Your address: <a href={`https://${org.tenant_hostname}`}>{org.tenant_hostname}</a></p>}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.completed} aria-label="Setup progress" style={{ flex: 1, height: 10, background: "var(--surface-4)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${progress.percent}%`, height: "100%", background: "var(--btn-solid)" }} />
          </div>
          <strong>{progress.completed} of {progress.total} done</strong>
        </div>
        {progress.allDone && <p style={{ marginBottom: 0, color: "var(--text-success)" }}><strong>All set.</strong> Share your join code with families when you are ready.</p>}
      </section>

      <section style={card}>
        <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {progress.items.map((item: Row) => <li key={item.key} style={{ display: "flex", gap: 14, padding: "14px 0", borderTop: "1px solid var(--line-soft)", alignItems: "flex-start" }}>
            <span aria-hidden="true" style={{ width: 26, height: 26, flex: "0 0 26px", borderRadius: 999, display: "grid", placeItems: "center", background: item.done ? "#15803d" : "var(--surface)", border: item.done ? "0" : "2px solid var(--line-strong)", color: "white", fontWeight: 900 }}>{item.done ? <Check className="icon" aria-hidden="true" /> : ""}</span>
            <div style={{ flex: 1 }}>
              <strong>{item.label}</strong> <span style={{ position: "absolute", left: -9999 }}>{item.done ? "(done)" : "(not done)"}</span>
              <div style={{ color: "var(--text-3)", fontSize: 14 }}>{item.description}</div>
              {item.source === "manual" && <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Marked done by hand.</div>}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <a href={item.href.startsWith("/admin/setup") ? item.href.replace("/admin/setup", "") : `${item.href}${item.href.startsWith("/admin/") ? `?organizationId=${organizationId}` : ""}`} style={{ fontWeight: 700, color: "var(--text)" }}>{item.done ? "View" : "Open"}</a>
              {item.manual && item.source !== "automatic" && <button disabled={working} onClick={() => mark(item.key, !item.done)}>{item.done ? "Undo" : "Mark Done"}</button>}
            </div>
          </li>)}
        </ol>
      </section>

      <section id="join-code" style={card}>
        <h2 style={{ marginTop: 0 }}>Join Code</h2>
        <p style={{ color: "var(--text-3)" }}>Families enter this code in BandWagon to join. You have {checklist.activeJoinCodes} active code{checklist.activeJoinCodes === 1 ? "" : "s"}. Codes are only shown once, so copy it now.</p>
        {joinCode && <p style={{ fontSize: 28, letterSpacing: 3, fontWeight: 900, margin: "8px 0" }}><code>{joinCode}</code> <button onClick={() => navigator.clipboard?.writeText(joinCode)}>Copy</button></p>}
        {checklist.role !== "manager" && <button disabled={working} onClick={makeJoinCode} style={button}>Create A Join Code</button>}
      </section>

      <section id="invite" style={card}>
        <h2 style={{ marginTop: 0 }}>Invite A Co-Admin</h2>
        {invitableRoles.length === 0 ? <p style={{ color: "var(--text-3)" }}>Only owners and admins can invite people.</p> : <>
          <p style={{ color: "var(--text-3)" }}>They get an email with a one-time link that works for 7 days. They must sign in with the same email.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="name@example.com" aria-label="Email" style={{ ...input, flex: "1 1 240px" }} />
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} aria-label="Role" style={input}>
              {invitableRoles.map(role => <option key={role} value={role}>{role === "admin" ? "Admin" : "Manager"}</option>)}
            </select>
            <button disabled={working || !inviteEmail.trim()} onClick={invite} style={button}>Send Invite</button>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Admins can manage settings and invite managers. Managers help run rides and members.</p>
        </>}
        {inviteLink && <p style={{ wordBreak: "break-all", padding: 10, background: "var(--surface-2)", borderRadius: 8 }}><code>{inviteLink}</code> <button onClick={() => navigator.clipboard?.writeText(inviteLink)}>Copy</button></p>}
        {invites.length > 0 && <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
          <thead><tr><th style={{ textAlign: "left", padding: 6 }}>Email</th><th style={{ textAlign: "left" }}>Role</th><th style={{ textAlign: "left" }}>Status</th><th /></tr></thead>
          <tbody>{invites.map(i => <tr key={i.id} style={{ borderTop: "1px solid var(--line-soft)" }}>
            <td style={{ padding: 6, wordBreak: "break-all" }}>{i.email}</td><td>{i.role}</td><td>{STATE_LABEL[i.state] || i.state}</td>
            <td style={{ textAlign: "right" }}>{i.state === "active" && invitableRoles.includes(i.role) && <button disabled={working} onClick={() => revoke(i.id)}>Cancel</button>}</td>
          </tr>)}</tbody>
        </table>}
      </section>
    </>}

    {message && <p role="status" style={{ padding: 14, background: "var(--surface-2)", border: "1px solid var(--line-2)", borderRadius: 10 }}>{message}</p>}
  </main>;
}
