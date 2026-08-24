"use client";

import { useEffect, useState } from "react";

type Account = {
  user_account_id: string;
  platform_role: "owner" | "support" | "finance" | "readonly" | null;
  display_name: string;
  email: string | null;
  person_type: string;
  organization_count: number;
  last_login_at: string | null;
};

const roles = ["none", "readonly", "finance", "support", "owner"] as const;

export default function PlatformRolesPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [operatorId, setOperatorId] = useState("");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [workingId, setWorkingId] = useState("");

  async function load(search = "") {
    setMessage("");
    const suffix = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : "";
    const response = await fetch(`/api/admin/platform-roles${suffix}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.error || "Unable to load platform roles");
      return;
    }
    setOperatorId(data.operatorUserAccountId || "");
    setAccounts(data.accounts || []);
  }

  async function save(account: Account, platformRole: string) {
    const nextRole = platformRole === "none" ? null : platformRole;
    const detail = nextRole ? `grant ${nextRole}` : "remove platform access";
    if (!window.confirm(`${detail} for ${account.display_name}?`)) return;
    setWorkingId(account.user_account_id);
    setMessage("");
    const response = await fetch("/api/admin/platform-roles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetUserAccountId: account.user_account_id, platformRole: nextRole }),
    });
    const data = await response.json().catch(() => ({}));
    setWorkingId("");
    if (!response.ok) {
      setMessage(data.error || "Unable to update platform role");
      return;
    }
    setMessage(`Updated ${account.display_name}.`);
    await load(query);
  }

  useEffect(() => { void load(); }, []);

  const card = { background: "white", border: "1px solid #e2e8f0", borderRadius: 16, padding: 18, marginTop: 18 } as const;
  const input = { padding: 10, border: "1px solid #cbd5e1", borderRadius: 9 } as const;

  return (
    <main style={{ maxWidth: 1100, margin: "32px auto", padding: "0 20px", fontFamily: "system-ui,sans-serif" }}>
      <header style={{ background: "#101b33", color: "white", padding: 28, borderRadius: 22 }}>
        <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1 }}>PLATFORM OWNER</div>
        <h1 style={{ fontSize: 40, margin: "6px 0" }}>Platform Roles</h1>
        <p style={{ margin: 0, opacity: 0.9 }}>Grant least-privilege access and keep every role change in the audit trail.</p>
      </header>

      <section style={card}>
        <form onSubmit={(event) => { event.preventDefault(); void load(query); }} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a name or email" style={{ ...input, minWidth: 280, flex: 1 }} />
          <button type="submit">Search Accounts</button>
          <button type="button" onClick={() => { setQuery(""); void load(); }}>Current Roles</button>
        </form>
        <p style={{ color: "#64748b", fontSize: 14, marginBottom: 0 }}>Search returns active accounts. Without a search, only accounts with platform access are shown.</p>
      </section>

      <section style={card}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead><tr><th align="left">Account</th><th align="left">Current role</th><th align="center">Organizations</th><th align="left">Change role</th></tr></thead>
            <tbody>{accounts.map((account) => {
              const self = account.user_account_id === operatorId;
              return <tr key={account.user_account_id} style={{ borderTop: "1px solid #e2e8f0" }}>
                <td style={{ padding: "12px 8px 12px 0" }}><strong>{account.display_name}</strong>{self ? " (you)" : ""}<div style={{ color: "#64748b", fontSize: 13 }}>{account.email || "No verified email"}</div></td>
                <td><code>{account.platform_role || "none"}</code></td>
                <td align="center">{account.organization_count}</td>
                <td>
                  <select
                    value={account.platform_role || "none"}
                    disabled={self || workingId === account.user_account_id}
                    onChange={(event) => void save(account, event.target.value)}
                    style={input}
                    aria-label={`Platform role for ${account.display_name}`}
                  >
                    {roles.map((role) => <option key={role} value={role}>{role}</option>)}
                  </select>
                </td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        {!accounts.length && <p>No matching active accounts.</p>}
      </section>

      {message && <p style={{ padding: 14, background: "#f8fafc", borderRadius: 10 }}>{message}</p>}
    </main>
  );
}
