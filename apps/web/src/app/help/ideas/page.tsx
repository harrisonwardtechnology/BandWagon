import type { Metadata } from "next";
import FeatureIdeas from "@/components/feature-ideas";

export const metadata: Metadata = {
  title: "Suggest a Feature | BandWagon Help",
  description: "Share an idea for BandWagon, vote on ideas from other families and drivers, and follow what the team is building.",
};

export default function FeatureIdeasPage() {
  return (
    <main style={{ maxWidth: 960, margin: "32px auto", padding: "0 20px", fontFamily: "system-ui,sans-serif" }}>
      <header style={{ background: "#101b33", color: "white", padding: 30, borderRadius: 22, marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1 }}>BANDWAGON HELP CENTER</div>
        <h1 style={{ fontSize: 38, margin: "6px 0" }}>Ideas and Feature Requests</h1>
        <p style={{ margin: 0, opacity: 0.9 }}>BandWagon is built with the families, drivers, and volunteers who use it. Tell us what would help.</p>
        <p style={{ margin: "12px 0 0" }}><a href="/help" style={{ color: "white", fontWeight: 800 }}>Back to the Help Center</a></p>
      </header>
      <FeatureIdeas />
      <p style={{ color: "#64748b", fontSize: 14, marginTop: 18 }}>Need help with something that is not working? Use <a href="/help#contact-support-title">Contact BandWagon Support</a> instead. For a safety emergency, call 911.</p>
    </main>
  );
}
