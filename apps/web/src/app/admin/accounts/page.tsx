"use client";

import { useState } from "react";

export default function AccountsAdminPage() {
  const [token, setToken] = useState("");
  const [householdName, setHouseholdName] = useState("Ward Family");
  const [householdId, setHouseholdId] = useState("");
  const [adultName, setAdultName] = useState("Test Parent");
  const [adultEmail, setAdultEmail] = useState("");
  const [adultPhone, setAdultPhone] = useState("");
  const [adultId, setAdultId] = useState("");
  const [studentName, setStudentName] = useState("Test Student");
  const [result, setResult] = useState<any>(null);
  const [message, setMessage] = useState("");

  const headers = { "content-type": "application/json", "x-bandwagon-admin-token": token };
  const input = { width: "100%", padding: 11, margin: "6px 0 12px", border: "1px solid #cbd5e1", borderRadius: 8 } as const;
  const card = { border: "1px solid #dbe3ef", borderRadius: 16, padding: 20, marginTop: 18 } as const;

  async function call(payload: any) {
    setMessage("Working...");
    const r = await fetch("/api/admin/accounts", { method: "POST", headers, body: JSON.stringify(payload) });
    const data = await r.json().catch(() => ({}));
    setResult(data);
    setMessage(r.ok ? "Done." : data.error || "Request failed");
    return data;
  }

  async function makeHousehold() {
    const data = await call({ action: "create_household", name: householdName });
    if (data.household?.id) setHouseholdId(data.household.id);
  }

  async function makeAdult() {
    const data = await call({
      action: "create_adult",
      displayName: adultName,
      email: adultEmail || null,
      phone: adultPhone || null,
      householdId: householdId || null,
      manager: true,
      organizationSlug: "flomogo",
    });
    if (data.person?.id) setAdultId(data.person.id);
  }

  async function makeStudent() {
    await call({
      action: "create_student",
      displayName: studentName,
      householdId: householdId || null,
      guardianPersonId: adultId || null,
      organizationSlug: "flomogo",
      studentApprovalRequired: true,
    });
  }

  async function loadHousehold() {
    const r = await fetch(`/api/admin/accounts?householdId=${encodeURIComponent(householdId)}`, {
      headers: { "x-bandwagon-admin-token": token },
    });
    const data = await r.json().catch(() => ({}));
    setResult(data);
    setMessage(r.ok ? "Household loaded." : data.error || "Unable to load household");
  }

  return (
    <main style={{ maxWidth: 980, margin: "40px auto", padding: "0 20px", fontFamily: "system-ui,sans-serif" }}>
      <section style={{ background: "#101b33", color: "white", padding: 28, borderRadius: 22 }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1 }}>PLATFORM ADMIN</div>
        <h1 style={{ margin: "6px 0", fontSize: 38 }}>Accounts & Households</h1>
        <p style={{ margin: 0, opacity: 0.9 }}>Development console for the parent, student, household and guardian model.</p>
      </section>

      <section style={card}>
        <label><strong>Admin Test Token</strong></label>
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)} style={input} />
      </section>

      <section style={card}>
        <h2>1. Create Household</h2>
        <input value={householdName} onChange={(e) => setHouseholdName(e.target.value)} style={input} />
        <button onClick={makeHousehold}>Create Household</button>
        <p>Household ID: <code>{householdId || "not created"}</code></p>
      </section>

      <section style={card}>
        <h2>2. Add Parent / Household Manager</h2>
        <label>Name</label><input value={adultName} onChange={(e) => setAdultName(e.target.value)} style={input} />
        <label>Email (optional)</label><input value={adultEmail} onChange={(e) => setAdultEmail(e.target.value)} style={input} />
        <label>Phone in E.164 (optional)</label><input value={adultPhone} onChange={(e) => setAdultPhone(e.target.value)} placeholder="+14695551212" style={input} />
        <button onClick={makeAdult}>Create Parent</button>
        <p>Parent ID: <code>{adultId || "not created"}</code></p>
      </section>

      <section style={card}>
        <h2>3. Add Student</h2>
        <input value={studentName} onChange={(e) => setStudentName(e.target.value)} style={input} />
        <button onClick={makeStudent}>Create Student + Guardian Link</button>
      </section>

      <section style={card}>
        <h2>Household Snapshot</h2>
        <button disabled={!householdId} onClick={loadHousehold}>Load Household</button>
      </section>

      {message && <p style={{ background: "#f8fafc", padding: 12, borderRadius: 8 }}>{message}</p>}
      {result && <pre style={{ ...card, whiteSpace: "pre-wrap", overflowWrap: "anywhere", background: "#f8fafc" }}>{JSON.stringify(result, null, 2)}</pre>}
    </main>
  );
}
