import type { Metadata } from "next";
import ReadinessCheck from "./ReadinessCheck";
import { SupportContact } from "@/components/support-contact";
import { statusPageUrl } from "@/lib/public-links";
import { publicPageMetadata } from "@/lib/seo";

export const metadata: Metadata = publicPageMetadata({
  title: "Platform Status",
  description: "Check whether BandWagon is up right now and find the public status page.",
  path: "/status",
});

export default function StatusPage() {
  const statusUrl = statusPageUrl();
  const card = { background: "var(--surface)", border: "1px solid var(--line-2)", borderRadius: 18, padding: 24, marginBottom: 18 } as const;
  return (
    <main style={{ maxWidth: 860, margin: "32px auto", padding: "0 20px", fontFamily: "system-ui,sans-serif" }}>
      <header style={{ background: "var(--panel-solid)", color: "#fff", padding: 30, borderRadius: 22, marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1 }}>BANDWAGON STATUS</div>
        <h1 style={{ fontSize: 40, margin: "6px 0" }}>Is BandWagon working?</h1>
        <p style={{ margin: 0, opacity: 0.9 }}>A live check from your browser, plus our public status page.</p>
      </header>

      <section style={card} aria-labelledby="live-check-title">
        <h2 id="live-check-title" style={{ marginTop: 0, color: "var(--text)" }}>Live Check</h2>
        <ReadinessCheck />
        <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 0 }}>
          This asks the server you are connected to whether it is ready. If it says up but something still looks wrong, try refreshing the page or signing in again.
        </p>
      </section>

      {statusUrl && (
        <section style={card} aria-labelledby="status-page-title">
          <h2 id="status-page-title" style={{ marginTop: 0, color: "var(--text)" }}>Public Status Page</h2>
          <p style={{ color: "var(--text-3)", lineHeight: 1.6 }}>See uptime history, planned maintenance, and incident updates for BandWagon and each community.</p>
          <a href={statusUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", padding: "12px 16px", borderRadius: 10, background: "#2458d8", color: "#fff", textDecoration: "none", fontWeight: 900 }}>
            Open The Status Page<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </section>
      )}

      <section style={{ ...card, background: "var(--bg-info)", borderColor: "var(--line-info)" }}>
        <h2 style={{ marginTop: 0, color: "var(--text)" }}>Still need help?</h2>
        <p style={{ color: "var(--text-3)", lineHeight: 1.6 }}>
          Visit the <a href="/help">Help Center</a> or contact <SupportContact />. BandWagon is not emergency dispatch. In an emergency, call 911.
        </p>
      </section>
    </main>
  );
}
