"use client";

import { useEffect, useState } from "react";
import { appCardStyle } from "@/components/app-nav";

type Row = Record<string, any>;
type Scopes = { requestRides: boolean; approveRides: boolean; viewRideDetails: boolean; receiveNotifications: boolean };

const SCOPE_OPTIONS: Array<[keyof Scopes, string, string]> = [
  ["requestRides", "Ask for rides", "Request rides for the kids and accept a driver's offer."],
  ["approveRides", "Approve rides", "Approve or decline ride requests that need a parent's OK."],
  ["viewRideDetails", "See ride details", "See who is driving, when, and the general pickup area."],
  ["receiveNotifications", "Get notifications", "Hear about ride updates, like when the driver is on the way."],
];

const HISTORY_TEXT: Record<string, string> = {
  "household_delegate.invited": "sent an invitation",
  "household_delegate.invitation_canceled": "canceled an invitation",
  "household_delegate.accepted": "accepted an invitation",
  "household_delegate.updated": "changed permissions",
  "household_delegate.paused": "paused access",
  "household_delegate.resumed": "turned access back on",
  "household_delegate.revoked": "removed access",
  "household_delegate.left": "stepped away",
  "household_delegate.ride_requested": "asked for a ride",
  "household_delegate.ride_approved": "approved a ride",
  "household_delegate.ride_denied": "declined a ride",
  "household_delegate.offer_accepted": "accepted a driver's offer",
  "household_delegate.ride_cancelled": "cancelled a ride",
  "household_delegate.ride_updated": "updated a ride",
  "household_delegate.waitlist_joined": "joined a carpool waitlist",
  "household_delegate.waitlist_left": "left a carpool waitlist",
  "household_delegate.standby_accepted": "accepted an open carpool seat",
  "household_delegate.standby_declined": "declined an open carpool seat",
};

const STATE_TEXT: Record<string, string> = { active: "Active", paused: "Paused", revoked: "Removed", expired: "Ended", not_started: "Not started yet" };

const emptyScopes: Scopes = { requestRides: true, approveRides: false, viewRideDetails: true, receiveNotifications: true };

function dateInput(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "";
}

function endOfDay(value: string) {
  return value ? new Date(`${value}T23:59:59`).toISOString() : null;
}

function ScopePicker({ scopes, onChange, disabled }: { scopes: Scopes; onChange: (next: Scopes) => void; disabled?: boolean }) {
  return <div style={{ display: "grid", gap: 8, margin: "8px 0 12px" }}>
    {SCOPE_OPTIONS.map(([key, label, help]) => <label key={key} style={{ display: "flex", gap: 9, alignItems: "start" }}>
      <input type="checkbox" checked={scopes[key]} disabled={disabled} onChange={e => onChange({ ...scopes, [key]: e.target.checked })} />
      <span><b>{label}</b><br /><small style={{ color: "#64748b" }}>{help}</small></span>
    </label>)}
  </div>;
}

function ChildPicker({ kids, childScope, childIds, onChange, disabled }: { kids: Row[]; childScope: string; childIds: string[]; onChange: (scope: string, ids: string[]) => void; disabled?: boolean }) {
  return <div style={{ margin: "8px 0 12px" }}>
    <label style={{ display: "block" }}><input type="radio" checked={childScope === "all"} disabled={disabled} onChange={() => onChange("all", [])} /> All Of My Children</label>
    <label style={{ display: "block" }}><input type="radio" checked={childScope === "selected"} disabled={disabled} onChange={() => onChange("selected", childIds)} /> Only These Children</label>
    {childScope === "selected" && <div style={{ paddingLeft: 22 }}>
      {kids.map(child => <label key={child.id} style={{ display: "block" }}>
        <input type="checkbox" checked={childIds.includes(child.id)} disabled={disabled} onChange={e => onChange("selected", e.target.checked ? [...childIds, child.id] : childIds.filter(id => id !== child.id))} /> {child.name}
      </label>)}
    </div>}
  </div>;
}

export default function TrustedAdults() {
  const [data, setData] = useState<Row | null>(null);
  const [message, setMessage] = useState("");
  const [shareLink, setShareLink] = useState("");
  const [working, setWorking] = useState(false);
  const [invite, setInvite] = useState<Row>({ contactType: "email", contact: "", relationshipLabel: "", scopes: emptyScopes, childScope: "all", childIds: [], endsAt: "" });
  const [editing, setEditing] = useState<Row>({});
  const [requestForms, setRequestForms] = useState<Record<string, Row>>({});

  async function load() {
    const r = await fetch("/api/household/delegates", { cache: "no-store" });
    const d = await r.json().catch(() => ({}));
    if (r.ok) setData(d);
  }
  async function act(body: Row, success = "Saved.") {
    setWorking(true); setMessage("");
    const r = await fetch("/api/household/delegates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setWorking(false);
    if (!r.ok) { setMessage(d.error || "Unable to save"); return null; }
    setData(d); setMessage(success);
    return d;
  }
  useEffect(() => { void load(); }, []);

  const input = { width: "100%", padding: 10, border: "1px solid #cbd5e1", borderRadius: 9, margin: "6px 0 12px", boxSizing: "border-box" as const };
  const button = { padding: "10px 14px", border: 0, borderRadius: 9, background: "#101b33", color: "white", fontWeight: 800, cursor: "pointer" } as const;
  const light = { padding: "7px 10px", border: "1px solid #cbd5e1", borderRadius: 8, background: "white", cursor: "pointer" } as const;

  const guardian = data?.guardian;
  const families: Row[] = data?.delegate?.families || [];

  async function sendInvite() {
    const d = await act({ action: "invite", ...invite, endsAt: endOfDay(invite.endsAt) }, "Invitation created.");
    if (!d) return;
    const link = d.result?.inviteUrl || "";
    setShareLink(link);
    setMessage(d.result?.emailSent ? "Invitation emailed." : "Invitation created. Share the link below with them.");
    setInvite({ ...invite, contact: "", relationshipLabel: "" });
  }

  return <>
    {guardian && <section style={{ ...appCardStyle, marginBottom: 18 }}>
      <h2 style={{ marginTop: 0 }}>Trusted Adults</h2>
      <p style={{ color: "#64748b" }}>Invite a grandparent, nanny, or co-parent in another home to help with your kids&apos; rides. You choose what they can do, and you can pause or remove them at any time. Trusted adults can never change your children&apos;s profiles or safety settings, add or remove guardians, or give access to anyone else.</p>

      {guardian.pendingApprovals.length > 0 && <div style={{ marginBottom: 14, padding: 12, background: "#fffbeb", borderRadius: 10 }}>
        <b>Rides Waiting For Your OK</b>
        {guardian.pendingApprovals.map((r: Row) => <div key={r.id} style={{ marginTop: 8 }}>
          {r.child_name}: {r.event_title || "Ride"}{r.requested_pickup_at ? `, pickup ${new Date(r.requested_pickup_at).toLocaleString()}` : ""} ({r.organization_name}). Asked by {r.requester_name}.
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button disabled={working} style={button} onClick={() => act({ action: "approve_request", rideRequestId: r.id }, "Ride approved.")}>Approve</button>
            <button disabled={working} style={light} onClick={() => act({ action: "deny_request", rideRequestId: r.id }, "Ride declined.")}>Decline</button>
          </div>
        </div>)}
      </div>}
      {guardian.delegates.filter((d: Row) => d.status !== "revoked").length === 0 && <p>No trusted adults yet.</p>}
      {guardian.delegates.filter((d: Row) => d.status !== "revoked").map((d: Row) => <div key={d.id} style={{ padding: "12px 0", borderTop: "1px solid #f1f5f9" }}>
        <div><b>{d.name}</b>{d.relationshipLabel ? <span style={{ color: "#64748b" }}> · {d.relationshipLabel}</span> : null} <span style={{ marginLeft: 8, fontSize: 12, padding: "3px 7px", borderRadius: 999, background: d.state === "active" ? "#dcfce7" : "#fef3c7" }}>{STATE_TEXT[d.state] || d.state}</span></div>
        <small style={{ color: "#64748b" }}>
          {SCOPE_OPTIONS.filter(([key]) => d.scopes[key]).map(([, label]) => label).join(", ") || "No permissions"}
          {" · "}{d.childScope === "all" ? "All children" : guardian.children.filter((c: Row) => d.childIds.includes(c.id)).map((c: Row) => c.name).join(", ")}
          {d.endsAt ? ` · Ends ${new Date(d.endsAt).toLocaleDateString()}` : ""}
        </small>
        {editing.id === d.id ? <div style={{ marginTop: 10, padding: 12, background: "#f8fafc", borderRadius: 10 }}>
          <label>Relationship <span style={{ color: "#64748b" }}>(Optional)</span></label>
          <input value={editing.relationshipLabel || ""} onChange={e => setEditing({ ...editing, relationshipLabel: e.target.value })} style={input} />
          <b>What They Can Do</b>
          <ScopePicker scopes={editing.scopes} onChange={scopes => setEditing({ ...editing, scopes })} disabled={working} />
          <b>Which Children</b>
          <ChildPicker kids={guardian.children} childScope={editing.childScope} childIds={editing.childIds} onChange={(childScope, childIds) => setEditing({ ...editing, childScope, childIds })} disabled={working} />
          <label>End Date <span style={{ color: "#64748b" }}>(Optional)</span></label>
          <input type="date" value={editing.endsAt} onChange={e => setEditing({ ...editing, endsAt: e.target.value })} style={input} />
          <div style={{ display: "flex", gap: 8 }}>
            <button disabled={working} style={button} onClick={async () => { if (await act({ action: "update", delegateId: d.id, relationshipLabel: editing.relationshipLabel, scopes: editing.scopes, childScope: editing.childScope, childIds: editing.childIds, endsAt: endOfDay(editing.endsAt) })) setEditing({}); }}>Save Changes</button>
            <button disabled={working} style={light} onClick={() => setEditing({})}>Cancel</button>
          </div>
        </div> : <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <button disabled={working} style={light} onClick={() => setEditing({ id: d.id, relationshipLabel: d.relationshipLabel || "", scopes: d.scopes, childScope: d.childScope, childIds: d.childIds, endsAt: dateInput(d.endsAt) })}>Edit</button>
          {d.status === "active" ? <button disabled={working} style={light} onClick={() => act({ action: "pause", delegateId: d.id }, "Paused.")}>Pause</button>
            : <button disabled={working} style={light} onClick={() => act({ action: "resume", delegateId: d.id }, "Turned back on.")}>Turn Back On</button>}
          <button disabled={working} style={{ ...light, color: "#b91c1c" }} onClick={() => { if (window.confirm(`Remove ${d.name} as a trusted adult? This takes effect right away.`)) void act({ action: "revoke", delegateId: d.id }, "Removed."); }}>Remove</button>
        </div>}
      </div>)}

      {guardian.invitations.filter((i: Row) => i.state === "active").length > 0 && <>
        <h3>Waiting To Accept</h3>
        {guardian.invitations.filter((i: Row) => i.state === "active").map((i: Row) => <div key={i.id} style={{ padding: "8px 0", borderTop: "1px solid #f1f5f9", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span>{i.contactHint}{i.relationshipLabel ? ` · ${i.relationshipLabel}` : ""} <small style={{ color: "#64748b" }}>· link expires {new Date(i.expiresAt).toLocaleDateString()}</small></span>
          <button disabled={working} style={light} onClick={() => act({ action: "cancel_invitation", invitationId: i.id }, "Invitation canceled.")}>Cancel Invitation</button>
        </div>)}
      </>}

      <h3>Invite A Trusted Adult</h3>
      {guardian.children.length === 0 ? <p>Add a student to your household first.</p> : <>
        <div style={{ display: "flex", gap: 14, marginBottom: 6 }}>
          <label><input type="radio" checked={invite.contactType === "email"} onChange={() => setInvite({ ...invite, contactType: "email" })} /> Email</label>
          <label><input type="radio" checked={invite.contactType === "phone"} onChange={() => setInvite({ ...invite, contactType: "phone" })} /> Mobile Number</label>
        </div>
        <input value={invite.contact} onChange={e => setInvite({ ...invite, contact: e.target.value })} placeholder={invite.contactType === "email" ? "grandma@example.com" : "(555) 555-0100"} type={invite.contactType === "email" ? "email" : "tel"} style={input} />
        {invite.contactType === "phone" && <small style={{ display: "block", color: "#64748b", marginTop: -6, marginBottom: 10 }}>We do not text people who have not signed up for BandWagon texts. You will get a link to send them yourself.</small>}
        <label>Relationship <span style={{ color: "#64748b" }}>(optional, like Grandma or Nanny)</span></label>
        <input value={invite.relationshipLabel} onChange={e => setInvite({ ...invite, relationshipLabel: e.target.value })} style={input} />
        <b>What They Can Do</b>
        <ScopePicker scopes={invite.scopes} onChange={scopes => setInvite({ ...invite, scopes })} disabled={working} />
        <b>Which Children</b>
        <ChildPicker kids={guardian.children} childScope={invite.childScope} childIds={invite.childIds} onChange={(childScope, childIds) => setInvite({ ...invite, childScope, childIds })} disabled={working} />
        <label>End Date <span style={{ color: "#64748b" }}>(optional, access stops after this day)</span></label>
        <input type="date" value={invite.endsAt} onChange={e => setInvite({ ...invite, endsAt: e.target.value })} style={input} />
        <button disabled={working || !invite.contact.trim()} style={{ ...button, opacity: working || !invite.contact.trim() ? .6 : 1 }} onClick={() => void sendInvite()}>Send Invitation</button>
        <p style={{ fontSize: 13, color: "#64748b" }}>The link works once and expires in 7 days. They must be an adult with a verified BandWagon account.</p>
        {shareLink && <div style={{ padding: 12, background: "#f8fafc", borderRadius: 10 }}><b>Share This Link</b><input readOnly value={shareLink} onFocus={e => e.target.select()} style={input} /></div>}
      </>}

      {guardian.history.length > 0 && <details style={{ marginTop: 14 }}>
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>History</summary>
        {guardian.history.map((h: Row, index: number) => <div key={index} style={{ fontSize: 14, padding: "6px 0", borderTop: "1px solid #f1f5f9" }}>
          {new Date(h.occurredAt).toLocaleString()}: {h.actorName} {HISTORY_TEXT[h.action] || h.action}{h.childName ? ` for ${h.childName}` : ""}{h.delegateName && h.delegateName !== h.actorName ? ` (${h.delegateName})` : ""}
        </div>)}
      </details>}
    </section>}

    {families.length > 0 && <section style={{ ...appCardStyle, marginBottom: 18 }}>
      <h2 style={{ marginTop: 0 }}>Families You Help</h2>
      <p style={{ color: "#64748b" }}>You are a trusted adult for these families. You can only do what the parent chose.</p>
      {families.map(family => <div key={family.delegateId} style={{ padding: "12px 0", borderTop: "1px solid #f1f5f9" }}>
        <div><b>{family.householdName}</b> <span style={{ marginLeft: 8, fontSize: 12, padding: "3px 7px", borderRadius: 999, background: family.state === "active" ? "#dcfce7" : "#fef3c7" }}>{STATE_TEXT[family.state] || family.state}</span></div>
        <small style={{ color: "#64748b" }}>{family.permissions.join(", ")}{family.endsAt ? ` · Ends ${new Date(family.endsAt).toLocaleDateString()}` : ""}</small>
        {family.state !== "active" && <p style={{ color: "#92400e" }}>Your access is not active right now, so you cannot act for these children.</p>}
        {family.children.map((child: Row) => {
          const formKey = `${family.delegateId}:${child.id}`;
          const form = requestForms[formKey] || { organizationId: child.organizations[0]?.id || "", eventId: "", direction: "to_event", requestedPickupAt: "", pickupNote: "" };
          const org = child.organizations.find((o: Row) => o.id === form.organizationId);
          const setForm = (patch: Row) => setRequestForms(v => ({ ...v, [formKey]: { ...form, ...patch } }));
          return <div key={child.id} style={{ marginTop: 10, padding: 12, background: "#f8fafc", borderRadius: 10 }}>
            <b>{child.name}</b>
            {child.pendingApprovals.map((r: Row) => <div key={r.id} style={{ marginTop: 8, padding: 10, background: "#fffbeb", borderRadius: 8 }}>
              Waiting for approval: {r.event_title || "Ride"}{r.requested_pickup_at ? `, pickup ${new Date(r.requested_pickup_at).toLocaleString()}` : ""}{r.pickup_area ? ` near ${r.pickup_area}` : ""} ({r.organization_name})
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button disabled={working} style={button} onClick={() => act({ action: "approve_request", rideRequestId: r.id }, "Ride approved.")}>Approve</button>
                <button disabled={working} style={light} onClick={() => act({ action: "deny_request", rideRequestId: r.id }, "Ride declined.")}>Decline</button>
              </div>
            </div>)}
            {child.rides.map((ride: Row) => <div key={ride.id} style={{ marginTop: 8, fontSize: 14 }}>
              Ride: {ride.event_title || "Ride"} with {ride.driver_name}{ride.vehicle_label ? ` (${[ride.vehicle_color, ride.vehicle_label].filter(Boolean).join(" ")})` : ""}{ride.scheduled_pickup_at ? `, pickup ${new Date(ride.scheduled_pickup_at).toLocaleString()}` : ""}{ride.pickup_area ? ` near ${ride.pickup_area}` : ""}. Status: {String(ride.status).replace(/_/g, " ")}.
              {ride.canManage && ride.status === "confirmed" && <button disabled={working} style={{ ...light, marginLeft: 8 }} onClick={() => { if (window.confirm("Cancel this ride?")) void act({ action: "cancel_ride", rideId: ride.id }, "Ride cancelled."); }}>Cancel Ride</button>}
            </div>)}
            {child.requests.filter((r: Row) => r.status !== "matched" || r.limitedView).map((r: Row) => <div key={r.id} style={{ marginTop: 8, fontSize: 14 }}>
              Request: {r.event_title || "Ride"} ({String(r.status).replace(/_/g, " ")})
              {r.canManage && r.offers.map((o: Row) => <button key={o.id} disabled={working} style={{ ...light, marginLeft: 8 }} onClick={() => act({ action: "accept_offer", rideRequestId: r.id, offerId: o.id }, "Ride confirmed.")}>Accept {o.driverName}&apos;s Offer</button>)}
            </div>)}
            {family.state === "active" && family.scopes.requestRides && (child.organizations.length ? <div style={{ marginTop: 10 }}>
              <b style={{ fontSize: 14 }}>Ask For A Ride</b>
              <select value={form.organizationId} onChange={e => setForm({ organizationId: e.target.value, eventId: "" })} style={input}>
                {child.organizations.map((o: Row) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <select value={form.eventId} onChange={e => setForm({ eventId: e.target.value })} style={input}>
                <option value="">No Specific Event</option>
                {(org?.events || []).map((e: Row) => <option key={e.id} value={e.id}>{e.title}{e.starts_at ? ` (${new Date(e.starts_at).toLocaleDateString()})` : ""}</option>)}
              </select>
              <select value={form.direction} onChange={e => setForm({ direction: e.target.value })} style={input}>
                <option value="to_event">To The Event</option>
                <option value="from_event">Home From The Event</option>
                <option value="round_trip">Both Ways</option>
              </select>
              <label style={{ fontSize: 14 }}>Pickup Time</label>
              <input type="datetime-local" value={form.requestedPickupAt} onChange={e => setForm({ requestedPickupAt: e.target.value })} style={input} />
              <label style={{ fontSize: 14 }}>Note For The Driver <span style={{ color: "#64748b" }}>(Optional)</span></label>
              <input value={form.pickupNote} onChange={e => setForm({ pickupNote: e.target.value })} style={input} />
              <button disabled={working || !form.organizationId} style={button} onClick={() => act({ action: "request_ride", childId: child.id, organizationId: form.organizationId, eventId: form.eventId || null, direction: form.direction, requestedPickupAt: form.requestedPickupAt ? new Date(form.requestedPickupAt).toISOString() : null, pickupNote: form.pickupNote || null }, "Ride requested. The parents have been told.")}>Ask For A Ride</button>
            </div> : <p style={{ fontSize: 14, color: "#64748b" }}>{child.name} is not in an organization that allows trusted adults yet.</p>)}
          </div>;
        })}
        <button disabled={working} style={{ ...light, marginTop: 10 }} onClick={() => { if (window.confirm(`Stop being a trusted adult for ${family.householdName}?`)) void act({ action: "leave", delegateId: family.delegateId }, "You stepped away."); }}>Stop Helping This Family</button>
      </div>)}
    </section>}

    {message && <div role="status" style={{ position: "fixed", bottom: 20, left: 20, maxWidth: 360, padding: 14, background: "#101b33", color: "white", borderRadius: 12 }}>{message}</div>}
  </>;
}
