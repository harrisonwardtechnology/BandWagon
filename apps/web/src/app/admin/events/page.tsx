"use client";

import { useState } from "react";

export default function EventsAdminPage() {
  const [organizationId, setOrganizationId] = useState("");
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");

  async function load(orgId = organizationId) {
    const suffix = orgId ? `?organizationId=${encodeURIComponent(orgId)}` : "";
    const response = await fetch(`/api/admin/events${suffix}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setMessage(data.error || "Unable to load events");
    setOrganizations(data.organizations || []);
    setEvents(data.events || []);
    if (!orgId && data.organizations?.[0]) setOrganizationId(data.organizations[0].id);
  }

  async function runAction(action: string) {
    const response = await fetch("/api/admin/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, organizationId, title }),
    });
    const data = await response.json().catch(() => ({}));
    setMessage(response.ok ? JSON.stringify(data) : data.error || "Action failed");
    if (response.ok) await load();
  }

  const input = { width: "100%", padding: 10, margin: "6px 0 12px" } as const;
  const card = { marginTop: 20, padding: 20, border: "1px solid #dbe3ef", borderRadius: 16 } as const;

  return (
    <main style={{ maxWidth: 1000, margin: "40px auto", padding: 20, fontFamily: "system-ui,sans-serif" }}>
      <h1>BandWagon Events</h1>
      <section style={card}>
        <p>Signed-in organization administrators see only organizations they manage.</p>
        <button onClick={() => load()}>Load</button>
      </section>
      {organizations.length > 0 && (
        <section style={card}>
          <label>Organization</label>
          <select value={organizationId} onChange={(e) => { setOrganizationId(e.target.value); load(e.target.value); }} style={input}>
            {organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <button onClick={() => runAction("bind-google")}>Bind Active Google Connection</button>{" "}
          <button onClick={() => runAction("normalize")}>Normalize Imported Events</button>
        </section>
      )}
      <section style={card}>
        <h2>Create Manual Event</h2>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title" style={input} />
        <button onClick={() => runAction("create-manual")} disabled={!organizationId || !title.trim()}>Create</button>
      </section>
      {message && <p style={card}>{message}</p>}
      <section style={card}>
        <h2>Events</h2>
        {events.map((event) => <div key={event.id} style={{ padding: 10, borderBottom: "1px solid #eee" }}><strong>{event.title}</strong> · {event.source_type}</div>)}
      </section>
    </main>
  );
}
