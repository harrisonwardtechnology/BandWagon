"use client";

import { useEffect, useMemo, useState } from "react";
import { AppNav, appCardStyle, appPageStyle } from "@/components/app-nav";
import { ACCOUNT_DELETION_CONFIRMATION } from "@/lib/privacy-policy";

type PrivacyBlocker = {
  key: string;
  message: string;
  count?: number;
  items?: string[];
};

type PrivacyRequest = {
  id: string;
  request_type: "export" | "delete_account";
  status: string;
  scheduled_for?: string | null;
  requested_at: string;
  completed_at?: string | null;
  cancelled_at?: string | null;
  last_error?: string | null;
};

const activeDeletionStatuses = new Set(["requested", "processing", "scheduled", "blocked", "failed"]);
const cancellableDeletionStatuses = new Set(["requested", "scheduled", "blocked", "failed"]);
const buttonStyle = {
  border: 0,
  borderRadius: 10,
  padding: "11px 15px",
  fontWeight: 850,
  cursor: "pointer",
} as const;

function formatDate(value?: string | null) {
  if (!value) return "Not scheduled";
  return new Date(value).toLocaleString();
}

export default function PrivacySettingsPage() {
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [blockers, setBlockers] = useState<PrivacyBlocker[]>([]);
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<"export" | "delete" | "cancel" | "">("");

  const activeDeletion = useMemo(
    () => requests.find((request) => request.request_type === "delete_account" && activeDeletionStatuses.has(request.status)),
    [requests]
  );

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/privacy", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    setLoading(false);
    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!response.ok) {
      setMessage(data.error || "Unable to load privacy settings.");
      return;
    }
    setRequests(data.requests || []);
    setBlockers(data.deletionBlockers || []);
  }

  async function exportData() {
    setWorking("export");
    setMessage("");
    const response = await fetch("/api/privacy/export", { method: "POST" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setWorking("");
      setMessage(data.error || "Unable to export your data.");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bandwagon-data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setWorking("");
    setMessage("Your data export was downloaded.");
    await load();
  }

  async function scheduleDeletion() {
    if (confirmation.trim() !== ACCOUNT_DELETION_CONFIRMATION) return;
    setWorking("delete");
    setMessage("");
    const response = await fetch("/api/privacy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "request_deletion", confirmation }),
    });
    const data = await response.json().catch(() => ({}));
    setWorking("");
    if (!response.ok) {
      setMessage(data.error || "Unable to schedule account deletion.");
      return;
    }
    if (!data.result?.scheduled) {
      setBlockers(data.result?.blockers || []);
      setMessage("Resolve the listed items before scheduling account deletion.");
      return;
    }
    setConfirmation("");
    setMessage("Account deletion scheduled. You can cancel during the grace period.");
    await load();
  }

  async function cancelDeletion(requestId: string) {
    setWorking("cancel");
    setMessage("");
    const response = await fetch("/api/privacy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cancel_deletion", requestId }),
    });
    const data = await response.json().catch(() => ({}));
    setWorking("");
    if (!response.ok) {
      setMessage(data.error || "Unable to cancel account deletion.");
      return;
    }
    setMessage("Account deletion cancelled.");
    await load();
  }

  return (
    <main style={appPageStyle}>
      <AppNav active="Settings" />
      <nav aria-label="Settings sections" style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <a href="/app/settings/notifications" style={{ padding: "9px 12px", borderRadius: 9, background: "#f1f5f9", color: "#334155", textDecoration: "none", fontWeight: 800 }}>Notifications</a>
        <a href="/app/settings/privacy" aria-current="page" style={{ padding: "9px 12px", borderRadius: 9, background: "#101b33", color: "white", textDecoration: "none", fontWeight: 800 }}>Privacy &amp; Data</a>
      </nav>

      <section style={{ ...appCardStyle, marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 950, letterSpacing: 1, color: "#64748b" }}>PRIVACY &amp; DATA</div>
        <h1 style={{ margin: "7px 0" }}>Your information stays under your control.</h1>
        <p style={{ color: "#475569", marginBottom: 0 }}>
          Download a copy of your BandWagon data or schedule deletion of your account. Exact ride addresses are automatically queued for removal after the organization&apos;s retention window.
        </p>
      </section>

      <section style={{ ...appCardStyle, marginBottom: 18 }}>
        <h2 style={{ marginTop: 0 }}>Download My Data</h2>
        <p style={{ color: "#475569" }}>
          Get a JSON file containing your profile, contacts, memberships, household relationships, ride history, private locations, credential metadata, notifications, consents, and account activity. Credential file contents are not embedded.
        </p>
        <button type="button" onClick={exportData} disabled={Boolean(working)} style={{ ...buttonStyle, background: "#101b33", color: "white", opacity: working ? 0.65 : 1 }}>
          {working === "export" ? "Preparing export..." : "Download my data"}
        </button>
      </section>

      <section style={{ ...appCardStyle, marginBottom: 18, borderColor: "#fecaca" }}>
        <h2 style={{ marginTop: 0 }}>Delete My Account</h2>
        {loading ? (
          <p>Checking account status...</p>
        ) : activeDeletion ? (
          <div>
            <div style={{ padding: 14, borderRadius: 10, background: activeDeletion.status === "failed" ? "#fff7ed" : "#fef2f2", marginBottom: 14 }}>
              <strong>Deletion status: {activeDeletion.status.replaceAll("_", " ")}</strong>
              <div style={{ marginTop: 5, color: "#475569" }}>Scheduled for: {formatDate(activeDeletion.scheduled_for)}</div>
              {activeDeletion.last_error && <div style={{ marginTop: 5, color: "#9a3412" }}>{activeDeletion.last_error}</div>}
            </div>
            {cancellableDeletionStatuses.has(activeDeletion.status) && (
              <button type="button" onClick={() => cancelDeletion(activeDeletion.id)} disabled={Boolean(working)} style={{ ...buttonStyle, background: "white", color: "#991b1b", border: "1px solid #ef4444" }}>
                {working === "cancel" ? "Cancelling..." : "Cancel account deletion"}
              </button>
            )}
            {activeDeletion.status === "processing" && <p>Your deletion is being processed and can no longer be cancelled.</p>}
          </div>
        ) : (
          <>
            <p style={{ color: "#475569" }}>
              Deletion starts after a configurable grace period, normally seven days. You can cancel before processing starts. Sign-in data and direct personal information are removed; minimum de-identified safety, security, billing, and ride-integrity records may remain.
            </p>
            {blockers.length > 0 && (
              <div style={{ padding: 14, background: "#fff7ed", borderRadius: 10, marginBottom: 16 }}>
                <strong>Account deletion is currently blocked:</strong>
                <ul style={{ marginBottom: 0 }}>
                  {blockers.map((blocker) => (
                    <li key={blocker.key} style={{ marginTop: 7 }}>
                      {blocker.message}
                      {blocker.items?.length ? ` (${blocker.items.join(", ")})` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <label htmlFor="delete-confirmation" style={{ display: "block", fontWeight: 850, marginBottom: 6 }}>
              Type <code>{ACCOUNT_DELETION_CONFIRMATION}</code> to continue
            </label>
            <input
              id="delete-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              style={{ width: "100%", boxSizing: "border-box", padding: 11, border: "1px solid #cbd5e1", borderRadius: 9, marginBottom: 12 }}
            />
            <button
              type="button"
              onClick={scheduleDeletion}
              disabled={Boolean(working) || blockers.length > 0 || confirmation.trim() !== ACCOUNT_DELETION_CONFIRMATION}
              style={{ ...buttonStyle, background: "#b91c1c", color: "white", opacity: Boolean(working) || blockers.length > 0 || confirmation.trim() !== ACCOUNT_DELETION_CONFIRMATION ? 0.5 : 1 }}
            >
              {working === "delete" ? "Scheduling..." : "Schedule account deletion"}
            </button>
          </>
        )}
      </section>

      <section style={appCardStyle}>
        <h2 style={{ marginTop: 0 }}>Request History</h2>
        {!requests.length ? (
          <p>No privacy requests yet.</p>
        ) : (
          requests.map((request) => (
            <div key={request.id} style={{ padding: "10px 0", borderBottom: "1px solid #e2e8f0" }}>
              <strong>{request.request_type === "export" ? "Data export" : "Account deletion"}</strong>
              <div style={{ marginTop: 3, fontSize: 13, color: "#64748b" }}>
                {request.status.replaceAll("_", " ")} - requested {formatDate(request.requested_at)}
              </div>
            </div>
          ))
        )}
        <p style={{ marginBottom: 0, marginTop: 16, fontSize: 13 }}>
          Learn more in the <a href="/privacy">Privacy Policy</a>.
        </p>
      </section>

      <div aria-live="polite">
        {message && <div style={{ position: "fixed", right: 20, bottom: 20, maxWidth: 500, padding: 14, borderRadius: 12, background: "#101b33", color: "white" }}>{message}</div>}
      </div>
    </main>
  );
}
