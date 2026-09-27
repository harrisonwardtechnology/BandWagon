"use client";

import { useEffect, useState } from "react";
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import { AppNav, appCardStyle, appPageStyle } from "@/components/app-nav";
import { PASSKEY_EXPLAINER, PASSKEY_NICKNAME_MAX } from "@/lib/passkey-policy";

type Passkey = {
  id: string;
  nickname: string;
  rpId: string;
  synced: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  worksHere: boolean;
};

type Status = {
  enabled: boolean;
  rpId: string | null;
  recentSignIn: boolean;
  supportMode: boolean;
  passkeys: Passkey[];
};

const tab = { padding: "9px 12px", borderRadius: 9, background: "#f1f5f9", color: "#334155", textDecoration: "none", fontWeight: 800 } as const;
const activeTab = { ...tab, background: "#101b33", color: "white" } as const;
const primary = { border: 0, borderRadius: 10, padding: "11px 15px", fontWeight: 850, cursor: "pointer", background: "#101b33", color: "white" } as const;
const secondary = { border: "1px solid #cbd5e1", borderRadius: 10, padding: "8px 12px", fontWeight: 750, cursor: "pointer", background: "white", color: "#334155" } as const;
const input = { padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 9, fontSize: 15, width: "100%", boxSizing: "border-box" as const };

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function SecuritySettingsPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [supported, setSupported] = useState(true);
  const [nickname, setNickname] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState("");
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);

  useEffect(() => {
    setSupported(browserSupportsWebAuthn());
    void load();
  }, []);

  async function load() {
    const response = await fetch("/api/auth/passkeys", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { window.location.href = "/login?next=/app/settings/security"; return; }
    if (!response.ok) { setMessage(data.error || "Unable to load your passkeys."); return; }
    setStatus(data);
  }

  async function addPasskey() {
    setWorking("add"); setMessage("");
    try {
      const optionsResponse = await fetch("/api/auth/passkeys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "register_options" }) });
      const optionsData = await optionsResponse.json().catch(() => ({}));
      if (!optionsResponse.ok) {
        if (optionsData.code === "recent_sign_in_required") await load();
        setMessage(optionsData.error || "Unable to start adding a passkey.");
        return;
      }
      let attestation;
      try {
        attestation = await startRegistration({ optionsJSON: optionsData.options });
      } catch (error) {
        const name = error instanceof Error ? error.name : "";
        setMessage(name === "InvalidStateError" ? "This device already has a passkey for your account." : name === "NotAllowedError" ? "Adding the passkey was canceled." : "This device could not create a passkey.");
        return;
      }
      const verifyResponse = await fetch("/api/auth/passkeys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "register_verify", response: attestation, nickname }) });
      const verifyData = await verifyResponse.json().catch(() => ({}));
      if (!verifyResponse.ok) { setMessage(verifyData.error || "Unable to save the passkey."); return; }
      setNickname("");
      setMessage(`Passkey "${verifyData.passkey?.nickname || "Passkey"}" added. You can use it the next time you sign in.`);
      await load();
    } finally {
      setWorking("");
    }
  }

  async function saveName(id: string, value: string) {
    setWorking(`rename:${id}`); setMessage("");
    const response = await fetch("/api/auth/passkeys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "rename", id, nickname: value }) });
    const data = await response.json().catch(() => ({}));
    setWorking("");
    if (!response.ok) { setMessage(data.error || "Unable to rename the passkey."); return; }
    setEditing(null);
    await load();
  }

  async function remove(passkey: Passkey) {
    if (!window.confirm(`Remove "${passkey.nickname}"? You will not be able to sign in with it anymore.`)) return;
    setWorking(`remove:${passkey.id}`); setMessage("");
    const response = await fetch(`/api/auth/passkeys?id=${encodeURIComponent(passkey.id)}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    setWorking("");
    if (!response.ok) { setMessage(data.error || "Unable to remove the passkey."); return; }
    setMessage(`Removed "${passkey.nickname}". Also delete it from your device or password manager if you no longer need it.`);
    await load();
  }

  async function signInAgain() {
    await fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
    window.location.href = "/login?next=/app/settings/security";
  }

  const readOnly = Boolean(status?.supportMode);

  return <main style={appPageStyle}>
    <AppNav active="Settings" />
    <nav aria-label="Settings sections" style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
      <a href="/app/settings/notifications" style={tab}>Notifications</a>
      <a href="/app/settings/privacy" style={tab}>Privacy &amp; Data</a>
      <a href="/app/settings/security" aria-current="page" style={activeTab}>Security</a>
    </nav>

    <section style={{ ...appCardStyle, marginBottom: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 950, letterSpacing: 1, color: "#64748b" }}>SECURITY</div>
      <h1 style={{ margin: "7px 0" }}>Passkeys</h1>
      <p style={{ color: "#475569", margin: "0 0 6px" }}>{PASSKEY_EXPLAINER} No code needed.</p>
      <p style={{ color: "#64748b", margin: 0, fontSize: 14 }}>Your fingerprint or face never leaves your device. BandWagon only stores a public key. You can still sign in with a code at any time.</p>
    </section>

    {status && !status.enabled && <section style={{ ...appCardStyle, marginBottom: 18 }}>
      <p style={{ margin: 0, color: "#475569" }}>Passkeys are not available on this address right now. You can keep signing in with a code.</p>
    </section>}

    {status?.enabled && !readOnly && <section style={{ ...appCardStyle, marginBottom: 18 }}>
      <h2 style={{ marginTop: 0 }}>Add a passkey</h2>
      {!supported ? <p style={{ color: "#475569" }}>This browser does not support passkeys. Try the latest Safari, Chrome, Edge, or Firefox.</p>
        : !status.recentSignIn ? <>
          <p style={{ color: "#475569" }}>To keep your account safe, sign in again before adding a passkey. It only takes a moment.</p>
          <button onClick={signInAgain} style={primary}>Sign in again</button>
        </> : <>
          <label htmlFor="passkey-name" style={{ fontWeight: 750, display: "block", marginBottom: 6 }}>Name this passkey <span style={{ fontWeight: 400, color: "#64748b" }}>(optional)</span></label>
          <input id="passkey-name" value={nickname} maxLength={PASSKEY_NICKNAME_MAX} onChange={(e) => setNickname(e.target.value)} placeholder="For example, My iPhone" style={{ ...input, maxWidth: 360, marginBottom: 12, display: "block" }} />
          <button onClick={addPasskey} disabled={working === "add"} style={{ ...primary, opacity: working === "add" ? .65 : 1 }}>{working === "add" ? "Waiting for your device…" : "Add a passkey"}</button>
          {status.rpId && <p style={{ fontSize: 13, color: "#64748b", marginBottom: 0 }}>This passkey will work on {status.rpId}{status.rpId === "bandwagon.club" ? " and every community site ending in .bandwagon.club" : ""}.</p>}
        </>}
    </section>}

    <section style={{ ...appCardStyle, marginBottom: 18 }}>
      <h2 style={{ marginTop: 0 }}>Your passkeys</h2>
      {!status ? <p style={{ color: "#64748b" }}>Loading…</p>
        : status.passkeys.length === 0 ? <p style={{ color: "#64748b", margin: 0 }}>You have not added any passkeys yet.</p>
        : <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
          {status.passkeys.map((passkey) => <li key={passkey.id} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 14 }}>
            {editing?.id === passkey.id ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <label htmlFor={`rename-${passkey.id}`} style={{ position: "absolute", left: -9999 }}>New name</label>
              <input id={`rename-${passkey.id}`} value={editing.value} maxLength={PASSKEY_NICKNAME_MAX} onChange={(e) => setEditing({ id: passkey.id, value: e.target.value })} style={{ ...input, maxWidth: 280 }} />
              <button onClick={() => saveName(passkey.id, editing.value)} disabled={!editing.value.trim() || working === `rename:${passkey.id}`} style={secondary}>Save</button>
              <button onClick={() => setEditing(null)} style={secondary}>Cancel</button>
            </div> : <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 850 }}>{passkey.nickname}</div>
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 3 }}>
                  Added {formatDate(passkey.createdAt)} · Last used {formatDate(passkey.lastUsedAt)}{passkey.synced ? " · Synced across your devices" : ""}
                </div>
                <div style={{ fontSize: 13, color: passkey.worksHere ? "#15803d" : "#64748b", marginTop: 3 }}>
                  {passkey.worksHere ? "Works on this site" : `Works on ${passkey.rpId}`}
                </div>
              </div>
              {!readOnly && <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setEditing({ id: passkey.id, value: passkey.nickname })} style={secondary}>Rename</button>
                <button onClick={() => remove(passkey)} disabled={working === `remove:${passkey.id}`} style={{ ...secondary, color: "#b91c1c", borderColor: "#fecaca" }}>Remove</button>
              </div>}
            </div>}
          </li>)}
        </ul>}
    </section>

    {message && <div role="status" style={{ padding: 13, borderRadius: 10, background: "#eef2ff", color: "#1e293b" }}>{message}</div>}
  </main>;
}
