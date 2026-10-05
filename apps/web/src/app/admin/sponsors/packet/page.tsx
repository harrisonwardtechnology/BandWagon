"use client";

import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";

// Printable sponsor packet for pitching local businesses. Aggregate impact
// numbers only (with small-number suppression) and recognition options.
// Core Funding Boundary: sponsors never receive participant data, matching
// priority, or targeted advertising.

type Row = Record<string, any>;

export default function SponsorPacket() {
  const [report, setReport] = useState<Row | null>(null);
  const [sponsors, setSponsors] = useState<Row[]>([]);
  const [message, setMessage] = useState("Loading…");

  useEffect(() => { void (async () => {
    const id = new URLSearchParams(window.location.search).get("organizationId") || "";
    if (!id) { setMessage("Choose an organization from the Sponsors page first."); return; }
    const [r, s] = await Promise.all([fetch(`/api/admin/impact?organizationId=${encodeURIComponent(id)}`), fetch(`/api/admin/sponsors?organizationId=${encodeURIComponent(id)}`)]);
    const x = await r.json().catch(() => ({}));
    const y = await s.json().catch(() => ({}));
    if (!r.ok) { setMessage(x.error || "Unable to load the impact report"); return; }
    setReport(x.report);
    const now = Date.now();
    setSponsors((y.sponsors || []).filter((row: Row) => row.status === "active" && row.public_display && (!row.ends_at || new Date(row.ends_at).getTime() > now) && new Date(row.starts_at).getTime() <= now));
    setMessage("");
  })(); }, []);

  const school = report?.rows?.find((row: Row) => row.key === "school_year");
  const allTime = report?.rows?.find((row: Row) => row.key === "all_time");
  const box = { padding: 16, border: "1px solid var(--line-2)", borderRadius: 12 } as const;

  return <main style={{ maxWidth: 820, margin: "30px auto", padding: "0 20px", fontFamily: "system-ui,sans-serif", color: "var(--text)" }}>
    <style>{`@media print { .no-print { display: none !important; } main { margin: 0 !important; max-width: none !important; } header { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>
    {message && <p style={{ padding: 14, background: "var(--surface-3)", borderRadius: 12 }}>{message}</p>}
    {report && <>
      <div className="no-print" style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <button onClick={() => window.print()} style={{ padding: "10px 14px", border: 0, borderRadius: 9, background: "var(--btn-solid)", color: "var(--on-btn-solid)", fontWeight: 800, cursor: "pointer" }}>Print Or Save As PDF</button>
        <a href="/admin/sponsors" style={{ padding: "10px 14px" }}><ArrowLeft className="icon" aria-hidden="true" /> Back To Sponsors</a>
      </div>
      <header style={{ background: "var(--panel-solid)", color: "white", padding: 28, borderRadius: 22 }}>
        <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1 }}>COMMUNITY SPONSORSHIP</div>
        <h1 style={{ margin: "6px 0" }}>Help {report.organization.name} Families Get There Together</h1>
        <p style={{ marginBottom: 0, opacity: .9, lineHeight: 1.55 }}>{report.organization.name} uses BandWagon, a free and privacy-first carpool tool, so families can share rides to rehearsals, games, and events. Local sponsors help keep it free.</p>
      </header>

      <h2>Our Impact So Far</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
        {[
          ["Completed rides", "completedRides"],
          ["Car trips avoided", "avoidedTrips"],
          ["Vehicle miles avoided", "vehicleMilesAvoided"],
          ["Driving hours saved", "drivingHoursSaved"],
          ["CO2 avoided", "co2KgAvoided"],
          ["Families participating", "familiesParticipating"],
        ].map(([label, key]) => <div key={key} style={box}><div style={{ fontSize: 13, color: "var(--text-3)" }}>{label}</div><div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{school?.display?.[key]}</div><div style={{ fontSize: 12, color: "var(--text-muted)" }}>this school year · {allTime?.display?.[key]} all time</div></div>)}
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>Estimates are conservative: {report.settings.milesPerTrip} miles and {report.settings.minutesPerTrip} minutes per avoided car trip, and 400 grams of CO2 per vehicle mile (U.S. EPA). Counts under 5 are not shown.</p>

      <h2>Ways To Be Recognized</h2>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={box}><strong>Gold</strong> · Logo and link at the top of our public impact page, thanks at parent and booster meetings, and a mention in our newsletter each term.</div>
        <div style={box}><strong>Silver</strong> · Logo and link on our public impact page and a mention in our newsletter.</div>
        <div style={box}><strong>Community</strong> · Business name and link on our public impact page.</div>
      </div>
      <p style={{ fontSize: 13, color: "var(--text-3)" }}>Our organization sets the amount for each level. Payments support BandWagon platform operations and are not tax-deductible charitable contributions.</p>

      <h2>Our Promise To Families</h2>
      <div style={{ ...box, background: "var(--surface-2)" }}>
        <ul style={{ margin: 0, lineHeight: 1.6 }}>
          <li>Sponsors are thanked in front of adults only.</li>
          <li>Sponsors never receive names, contact details, ride history, schedules, or locations of anyone who uses BandWagon.</li>
          <li>Sponsors never get priority in ride matching.</li>
          <li>Sponsors never send targeted ads or messages to our families or students.</li>
        </ul>
      </div>

      {sponsors.length > 0 && <>
        <h2>Thank You To Our Current Sponsors</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          {sponsors.map(s => <div key={s.id} style={{ ...box, display: "flex", gap: 10, alignItems: "center" }}>{/^https:\/\//i.test(s.logo_url || "") && <img src={s.logo_url} alt="" referrerPolicy="no-referrer" style={{ width: 44, height: 44, objectFit: "contain" }} />}<div><strong>{s.sponsor_name}</strong>{s.tier_label ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.tier_label}</div> : null}</div></div>)}
        </div>
      </>}
      <p style={{ marginTop: 24, fontSize: 13, color: "var(--text-3)" }}>Questions? Contact the {report.organization.name} organizers who shared this packet with you.</p>
    </>}
  </main>;
}
