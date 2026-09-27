"use client";

import { useEffect, useState } from "react";

type Row = Record<string, any>;

export default function HouseholdInviteAccept({ token }: { token: string }) {
  const [invitation, setInvitation] = useState<Row | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState<Row | null>(null);
  const [working, setWorking] = useState(false);

  async function call(action: "preview" | "accept") {
    const r = await fetch("/api/household/delegate-invitations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, token }), cache: "no-store" });
    return { r, d: await r.json().catch(() => ({})) };
  }

  useEffect(() => {
    void (async () => {
      const { r, d } = await call("preview");
      setLoaded(true);
      if (!r.ok) { setError(d.error || "This invitation link is not valid"); return; }
      setInvitation(d.invitation); setSignedIn(Boolean(d.signedIn));
    })();
  }, [token]);

  async function accept() {
    setWorking(true); setError("");
    const { r, d } = await call("accept");
    setWorking(false);
    if (r.status === 401) { setSignedIn(false); setError("Sign in to accept this invitation."); return; }
    if (!r.ok) { setError(d.error || "Unable to accept invitation"); return; }
    setAccepted(d);
  }

  const card = { marginTop: 18, padding: 22, border: "1px solid #dbe3ef", borderRadius: 16, background: "white" } as const;
  const button = { padding: "12px 18px", border: 0, borderRadius: 10, background: "#101b33", color: "white", fontWeight: 800, cursor: "pointer", textDecoration: "none", display: "inline-block" } as const;

  return <main style={{ maxWidth: 680, margin: "40px auto", padding: "0 20px", fontFamily: "system-ui,sans-serif" }}>
    <section style={{ background: "#101b33", color: "white", padding: 28, borderRadius: 22 }}>
      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1 }}>BANDWAGON</div>
      <h1 style={{ fontSize: 32, margin: "6px 0" }}>Become a trusted adult</h1>
      {invitation && <p style={{ margin: 0, opacity: .9 }}>{invitation.inviterName} asked you to help with their family&apos;s rides.</p>}
    </section>

    {!loaded && <section style={card}><p style={{ margin: 0 }}>Checking your invitation...</p></section>}

    {accepted && <section style={card}>
      <h2 style={{ marginTop: 0 }}>You are all set</h2>
      <p>You are now a trusted adult for {accepted.householdName || "this family"}. The parent or guardian can change or end this at any time.</p>
      <a href="/app/household" style={button}>See the kids you help with</a>
    </section>}

    {!accepted && invitation && invitation.state !== "active" && <section style={card}>
      <p style={{ margin: 0 }}>{invitation.state === "accepted" ? "This invitation was already used." : invitation.state === "revoked" ? "This invitation was canceled. Ask the parent for a new one." : "This invitation has expired. Ask the parent for a new one."}</p>
    </section>}

    {!accepted && invitation && invitation.state === "active" && <section style={card}>
      <h2 style={{ marginTop: 0 }}>What you can do</h2>
      <ul>{(invitation.permissions || []).map((p: string) => <li key={p}>{p}</li>)}</ul>
      <p style={{ color: "#475569" }}>
        {invitation.childCount ? `This covers ${invitation.childCount} ${invitation.childCount === 1 ? "child" : "children"}.` : "This covers all of the children in the household."}
        {invitation.endsAt ? ` It ends on ${new Date(invitation.endsAt).toLocaleDateString()}.` : ""}
      </p>
      <p style={{ color: "#475569" }}>You will not be able to change the children&apos;s profiles or safety settings, add or remove guardians, or share access with anyone else. You will not join their school or team as a member.</p>
      <p>This invitation was sent to <strong>{invitation.contactHint}</strong>. You need an adult BandWagon account with that {invitation.contactType === "phone" ? "phone number" : "email address"} verified.</p>
      {signedIn
        ? <button disabled={working} onClick={accept} style={{ ...button, opacity: working ? .6 : 1 }}>{working ? "Accepting..." : "Accept invitation"}</button>
        : <><a href="/login" style={button}>Sign in</a><p style={{ color: "#475569", fontSize: 14 }}>After you sign in, open this link again.</p></>}
    </section>}

    {error && <p role="alert" style={{ padding: 14, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10 }}>{error}</p>}
  </main>;
}
