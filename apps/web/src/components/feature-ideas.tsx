"use client";

import { useEffect, useState } from "react";
import TurnstileWidget from "@/components/turnstile-widget";

// Everything a person typed is rendered as plain text. Nothing here injects
// raw HTML, and links in ideas are never turned into anchors.

type Row = Record<string, any>;
const inputStyle = { width: "100%", padding: 11, border: "1px solid #cbd5e1", borderRadius: 9, boxSizing: "border-box" as const, marginTop: 5, font: "inherit" };
const card = { background: "white", border: "1px solid #e2e8f0", borderRadius: 16, padding: 18 } as const;
const STATUS_COLORS: Record<string, string> = { new: "#64748b", under_review: "#1d4ed8", planned: "#7c3aed", in_progress: "#b45309", shipped: "#166534", declined: "#9f1239", duplicate: "#475569" };

export default function FeatureIdeas() {
  const [loaded, setLoaded] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [limits, setLimits] = useState<Row>({ titleMax: 120, detailsMax: 4000 });
  const [requests, setRequests] = useState<Row[]>([]);
  const [sort, setSort] = useState("votes");
  const [category, setCategory] = useState("");
  const [token, setToken] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [working, setWorking] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

  async function load(nextSort = sort, nextCategory = category) {
    const params = new URLSearchParams({ sort: nextSort });
    if (nextCategory) params.set("category", nextCategory);
    const r = await fetch(`/api/feature-requests?${params}`, { cache: "no-store" });
    const d = await r.json().catch(() => ({}));
    setLoaded(true);
    if (!r.ok) { setMessage(d.error || "Unable to load ideas."); return; }
    setSignedIn(Boolean(d.signedIn)); setCategories(d.categories || {}); setStatuses(d.statuses || {}); setLimits(d.limits || limits); setRequests(d.requests || []);
  }
  useEffect(() => { void load(); }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); setSuccess(false); setFields({});
    if (!signedIn && !token) { setMessage("Please complete the security check."); return; }
    const formElement = event.currentTarget;
    setWorking(true);
    try {
      const form = Object.fromEntries(new FormData(formElement).entries());
      const r = await fetch("/api/feature-requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, action: "create", turnstileToken: token }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setFields(d.fields || {}); setMessage(d.error || "Unable to send your idea."); return; }
      formElement.reset(); setSuccess(true);
      setMessage(signedIn ? "Thanks. Your idea was sent. You can follow its status below." : "Thanks. Your idea was sent to the BandWagon team. We will email you if its status changes.");
      if (signedIn) await load();
    } catch { setMessage("Unable to connect. Please try again."); }
    finally { setWorking(false); if (!signedIn) { setToken(""); setResetKey((x) => x + 1); } }
  }

  async function vote(row: Row) {
    const next = !row.has_voted;
    const r = await fetch("/api/feature-requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "vote", requestId: row.id, vote: next }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setMessage(d.error || "Unable to save your vote."); setSuccess(false); return; }
    setRequests((all) => all.map((item) => item.id === row.id ? { ...item, has_voted: d.hasVoted, vote_count: d.voteCount } : item));
  }

  const mine = requests.filter((r) => r.mine);
  const votable = new Set(["under_review", "planned", "in_progress"]);
  const board = requests.filter((r) => ["under_review", "planned", "in_progress", "shipped"].includes(r.status));
  const badge = (status: string) => <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 999, fontSize: 12, fontWeight: 800, color: "white", background: STATUS_COLORS[status] || "#475569" }}>{statuses[status] || status}</span>;
  const errorText = (key: string) => fields[key] ? <div style={{ color: "#9a3412", fontSize: 13, marginTop: 4 }}>{fields[key]}</div> : null;

  const ideaCard = (r: Row, showVote: boolean) => (
    <article key={r.id} style={{ borderTop: "1px solid #e2e8f0", padding: "14px 0", display: "flex", gap: 14, alignItems: "flex-start" }}>
      {showVote && <button onClick={() => vote(r)} disabled={!votable.has(r.status) && !r.has_voted} aria-pressed={Boolean(r.has_voted)} aria-label={`${r.has_voted ? "Remove your vote for" : "Vote for"} ${r.title}`}
        style={{ minWidth: 64, padding: "8px 6px", borderRadius: 10, border: "1px solid #cbd5e1", background: r.has_voted ? "#101b33" : "white", color: r.has_voted ? "white" : "#101b33", cursor: "pointer", fontWeight: 900 }}>
        <div style={{ fontSize: 20 }}>{r.vote_count}</div><div style={{ fontSize: 11 }}>{r.has_voted ? "Voted" : "Vote"}</div>
      </button>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}><strong style={{ fontSize: 17 }}>{r.title}</strong>{badge(r.status)}</div>
        <div style={{ fontSize: 13, color: "#64748b", marginTop: 3 }}>{categories[r.category] || r.category} · {new Date(r.created_at).toLocaleDateString()}{r.mine ? " · Your idea" : ""}</div>
        <p style={{ color: "#334155", whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: "8px 0 0" }}>{r.details}</p>
        {r.public_note && <p style={{ margin: "8px 0 0", padding: 10, background: "#eff6ff", borderRadius: 9, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}><strong>From the BandWagon team:</strong> {r.public_note}</p>}
        {r.status === "duplicate" && <p style={{ margin: "8px 0 0", color: "#475569" }}>This idea was merged with {r.duplicate_of_title ? <strong>{r.duplicate_of_title}</strong> : "an earlier idea"}. Your vote moved with it.</p>}
      </div>
    </article>
  );

  return <>
    <section style={{ ...card, marginBottom: 18 }} aria-labelledby="suggest-title">
      <h2 id="suggest-title" style={{ marginTop: 0 }}>Suggest a Feature</h2>
      <p style={{ color: "#475569" }}>Tell us what would make BandWagon work better for your family, drivers, or organization. Please do not include names, addresses, phone numbers, or other personal details about anyone.</p>
      {loaded && !signedIn && !siteKey
        ? <p><strong>The public idea form is temporarily unavailable.</strong> <a href="/login">Sign in</a> to suggest a feature.</p>
        : <form onSubmit={submit} style={{ display: "grid", gap: 13 }}>
          <div style={{ position: "absolute", left: "-10000px" }} aria-hidden="true"><label>Website<input name="companyWebsite" tabIndex={-1} autoComplete="off" /></label></div>
          <label><strong>Short title</strong><input name="title" required minLength={5} maxLength={limits.titleMax} style={inputStyle} placeholder="For example: Let me copy a ride request to next week" />{errorText("title")}</label>
          <label><strong>Category</strong><select name="category" required defaultValue="rides" style={inputStyle}>{Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{errorText("category")}</label>
          <label><strong>Details</strong><textarea name="details" required minLength={10} maxLength={limits.detailsMax} rows={6} style={{ ...inputStyle, resize: "vertical" }} placeholder="What are you trying to do, and what gets in the way today?" />{errorText("details")}</label>
          {loaded && !signedIn && <>
            <label><strong>Your email</strong><input name="email" type="email" required maxLength={320} autoComplete="email" style={inputStyle} /><span style={{ display: "block", fontSize: 13, color: "#64748b", marginTop: 4 }}>Used only to tell you about this idea. It is stored encrypted and never shown publicly.</span>{errorText("email")}</label>
            <TurnstileWidget action="feature_request" onToken={setToken} resetKey={resetKey} />
          </>}
          <button disabled={working || !loaded || (!signedIn && !token)} style={{ justifySelf: "start", padding: "12px 18px", border: 0, borderRadius: 10, background: "#2458d8", color: "white", fontWeight: 900, cursor: "pointer" }}>{working ? "Sending..." : "Send my idea"}</button>
        </form>}
      {message && <div role="status" aria-live="polite" style={{ marginTop: 12, padding: 12, borderRadius: 10, background: success ? "#ecfdf5" : "#fff7ed", color: success ? "#166534" : "#9a3412" }}>{message}</div>}
    </section>

    {loaded && !signedIn && <section style={{ ...card, background: "#eff6ff", borderColor: "#bfdbfe" }}>
      <h2 style={{ marginTop: 0 }}>See what others have suggested</h2>
      <p style={{ marginBottom: 0 }}><a href="/login"><strong>Sign in</strong></a> to browse ideas the team is reviewing, vote for the ones you want most, and follow the status of your own ideas.</p>
    </section>}

    {signedIn && mine.length > 0 && <section style={{ ...card, marginBottom: 18 }} aria-labelledby="my-ideas-title">
      <h2 id="my-ideas-title" style={{ marginTop: 0 }}>Your ideas</h2>
      {mine.map((r) => ideaCard(r, false))}
    </section>}

    {signedIn && <section style={card} aria-labelledby="all-ideas-title">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <h2 id="all-ideas-title" style={{ margin: 0 }}>Ideas the team is working through</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <label>Sort <select value={sort} onChange={(e) => { setSort(e.target.value); void load(e.target.value, category); }} style={{ padding: 7, borderRadius: 8 }}><option value="votes">Most votes</option><option value="newest">Newest</option></select></label>
          <label>Category <select value={category} onChange={(e) => { setCategory(e.target.value); void load(sort, e.target.value); }} style={{ padding: 7, borderRadius: 8 }}><option value="">All</option>{Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
      </div>
      <p style={{ color: "#64748b", fontSize: 14 }}>Vote for the ideas that matter most to you. One vote per person. New ideas appear here after the team reviews them.</p>
      {board.length === 0 && <p>No ideas here yet.</p>}
      {board.map((r) => ideaCard(r, true))}
    </section>}
  </>;
}
