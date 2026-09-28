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
  const card = { background: "#fff", border: "1px solid #dbe3ef", borderRadius: 18, padding: 24, marginBottom: 18 } as const;
  return (
    <main style={{ maxWidth: 860, margin: "32px auto", padding: "0 20px", fontFamily: "system-ui,sans-serif" }}>
      <header style={{ background: "#101b33", color: "#fff", padding: 30, borderRadius: 22, marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1 }}>BANDWAGON STATUS</div>
        <h1 style={{ fontSize: 40, margin: "6px 0" }}>Is BandWagon working?</h1>
        <p style={{ margin: 0, opacity: 0.9 }}>A live check from your browser, plus our public status page.</p>
      </header>

      <section style={card} aria-labelledby="live-check-title">
        <h2 id="live-check-title" style={{ marginTop: 0, color: "#101b33" }}>Live check</h2>
        <ReadinessCheck />
        <p style={{ color: "#64748b", fontSize: 14, marginBottom: 0 }}>
          This asks the server you are connected to whether it is ready. If it says up but something still looks wrong, try refreshing the page or signing in again.
        </p>
      </section>

      {statusUrl && (
        <section style={card} aria-labelledby="status-page-title">
          <h2 id="status-page-title" style={{ marginTop: 0, color: "#101b33" }}>Public status page</h2>
          <p style={{ color: "#475569", lineHeight: 1.6 }}>See uptime history, planned maintenance, and incident updates for BandWagon and each community.</p>
          <a href={statusUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", padding: "12px 16px", borderRadius: 10, background: "#2458d8", color: "#fff", textDecoration: "none", fontWeight: 900 }}>
            Open the status page<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </section>
      )}

      <section style={{ ...card, background: "#eff6ff", borderColor: "#bfdbfe" }}>
        <h2 style={{ marginTop: 0, color: "#101b33" }}>Still need help?</h2>
        <p style={{ color: "#475569", lineHeight: 1.6 }}>
          Visit the <a href="/help">Help Center</a> or contact <SupportContact />. BandWagon is not emergency dispatch. In an emergency, call 911.
        </p>
      </section>
    </main>
  );
}
