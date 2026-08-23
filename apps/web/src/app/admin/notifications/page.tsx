"use client";

import { useState } from "react";

const eventTypes = [
  "new_ride_available",
  "driver_offer",
  "ride_matched",
  "reminder_24h",
  "reminder_1h",
  "driver_arriving",
  "last_minute_cancellation",
  "pickup_changed",
  "platform_test",
];

export default function NotificationRoutingAdmin() {
  const [token, setToken] = useState("");
  const [notificationType, setNotificationType] = useState("ride_matched");
  const [title, setTitle] = useState("BandWagon ride update");
  const [body, setBody] = useState("Your BandWagon ride has been matched.");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [policies, setPolicies] = useState<any[]>([]);
  const [result, setResult] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const adminHeaders = () => ({
    "content-type": "application/json",
    "x-bandwagon-admin-token": token,
  });

  async function loadPolicies() {
    setMessage("");
    const r = await fetch("/api/admin/notification-routing", {
      headers: { "x-bandwagon-admin-token": token },
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setMessage(d.error || "Unable to load notification policies");
    setPolicies(d.policies || []);
  }

  async function testRouting() {
    setBusy(true);
    setResult(null);
    setMessage("Routing notification...");
    try {
      const r = await fetch("/api/admin/notification-routing", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ notificationType, title, body, phone: phone || null, email: email || null }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setMessage(d.error || "Notification routing failed");
      setResult(d);
      setMessage("Notification routing completed.");
    } finally {
      setBusy(false);
    }
  }

  const card = { marginTop: 20, padding: 20, border: "1px solid #dbe3ef", borderRadius: 16 } as const;
  const input = { display: "block", width: "100%", padding: 12, margin: "8px 0 14px", border: "1px solid #cbd5e1", borderRadius: 8 } as const;

  return (
    <main style={{ maxWidth: 1000, margin: "40px auto", padding: "0 20px", fontFamily: "system-ui,sans-serif" }}>
      <section style={{ background: "#101b33", color: "white", padding: 28, borderRadius: 22 }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1 }}>PLATFORM ADMIN</div>
        <h1 style={{ fontSize: 38, margin: "6px 0" }}>Notification Routing</h1>
        <p style={{ margin: 0, opacity: 0.9 }}>Push first. Email when useful. SMS/RCS only when the urgency or fallback policy calls for it.</p>
      </section>

      <section style={card}>
        <label><strong>Admin Test Token</strong></label>
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)} style={input} />
        <button onClick={loadPolicies}>Load Routing Policies</button>
      </section>

      {policies.length > 0 && (
        <section style={card}>
          <h2>Current Policies</h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th align="left">Event</th><th>Urgency</th><th>Push</th><th>Email fallback</th><th>SMS fallback</th><th>SMS immediate</th></tr></thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.type}>
                  <td>{p.type}</td><td align="center">{p.urgency}</td><td align="center">{p.push ? "Yes" : "No"}</td>
                  <td align="center">{p.emailFallback ? "Yes" : "No"}</td><td align="center">{p.smsFallback ? "Yes" : "No"}</td><td align="center">{p.smsImmediate ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section style={card}>
        <h2>Route A Test Notification</h2>
        <label>Event type</label>
        <select value={notificationType} onChange={(e) => setNotificationType(e.target.value)} style={input}>
          {eventTypes.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
        <label>Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={input} />
        <label>Message</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} style={input} />
        <label>Test phone (optional, E.164)</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+14695551212" style={input} />
        <label>Test email (optional)</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={input} />
        <button disabled={busy} onClick={testRouting}>{busy ? "Routing..." : "Run Routing Test"}</button>
      </section>

      {message && <p style={{ padding: 14, background: "#f8fafc", borderRadius: 10 }}>{message}</p>}
      {result && (
        <section style={card}>
          <h2>Routing Result</h2>
          <p>Correlation ID: <code>{result.correlationId}</code></p>
          <p>Urgency: <strong>{result.urgency}</strong></p>
          <p>Push: <strong>{result.push?.accepted || 0}</strong> accepted / {result.push?.attempted || 0} attempted</p>
          <p>SMS/RCS: <strong>{result.messaging?.accepted ? "Accepted" : result.messaging?.skipped || "Not sent"}</strong></p>
          <p>Email: <strong>{result.email?.accepted ? "Accepted" : result.email?.reason || "Not sent"}</strong></p>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", background: "#f8fafc", padding: 14, borderRadius: 10 }}>{JSON.stringify(result, null, 2)}</pre>
        </section>
      )}
    </main>
  );
}
