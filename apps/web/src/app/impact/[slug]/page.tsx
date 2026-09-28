import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getPublicImpact } from "@/lib/org-impact";
import { NOINDEX, publicPageMetadata } from "@/lib/seo";

// Public impact page. Shown only when the organization admin turns it on.
// Aggregate totals only, with small-number suppression. No names, rides,
// schedules, or locations. Sponsors listed here are recognition only.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One lookup per request, shared by generateMetadata and the page.
const loadImpact = cache((slug: string) => getPublicImpact(slug).catch(() => null));

// Indexable only while the organization has the public page turned on.
// Canonical is always the product host, even when opened on a community host.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadImpact(slug);
  if (!data) return { title: "Community Impact", robots: NOINDEX };
  return publicPageMetadata({
    title: `${data.organization.name} community impact`,
    description: `How families in ${data.organization.name} share rides with BandWagon: completed carpools, car trips avoided, and estimated miles and CO2 saved. Totals only.`,
    path: `/impact/${data.organization.slug}`,
  });
}

const METRICS: Array<[string, string]> = [
  ["completedRides", "Completed rides"],
  ["ridersServed", "Riders served"],
  ["seatsShared", "Seats shared"],
  ["avoidedTrips", "Car trips avoided"],
  ["vehicleMilesAvoided", "Vehicle miles avoided"],
  ["drivingHoursSaved", "Driving hours saved"],
  ["co2KgAvoided", "CO2 avoided"],
  ["activeDrivers", "Volunteer drivers"],
  ["familiesParticipating", "Families participating"],
];

export default async function PublicImpactPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadImpact(slug);
  if (!data) notFound();
  const rows = data.rows as Array<{ key: string; label: string; display: Record<string, string> }>;

  return <main style={{ maxWidth: 960, margin: "36px auto", padding: "0 20px", fontFamily: "system-ui,sans-serif", color: "#0f172a" }}>
    <header style={{ background: "#101b33", color: "white", padding: 28, borderRadius: 22 }}>
      <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1 }}>COMMUNITY IMPACT</div>
      <h1 style={{ margin: "6px 0" }}>{data.organization.name}</h1>
      <p style={{ marginBottom: 0, opacity: .9, lineHeight: 1.55 }}>Families sharing rides through BandWagon, a free and privacy-first carpool tool. These are totals only. Small numbers are hidden to protect privacy.</p>
    </header>

    <section style={{ marginTop: 18, padding: 22, border: "1px solid #dbe3ef", borderRadius: 16 }}>
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ textAlign: "left", borderBottom: "1px solid #dbe3ef" }}><th style={{ padding: 8 }}>Measure</th>{rows.map(row => <th key={row.key} style={{ padding: 8 }}>{row.label}</th>)}</tr></thead>
        <tbody>{METRICS.map(([key, label]) => <tr key={key} style={{ borderBottom: "1px solid #eef2f7" }}><td style={{ padding: 8, fontWeight: 700 }}>{label}</td>{rows.map(row => <td key={row.key} style={{ padding: 8 }}>{row.display[key]}</td>)}</tr>)}</tbody>
      </table></div>
      <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>{data.formulas.avoidedTrip} {data.formulas.miles} {data.formulas.co2} {data.formulas.privacy}</p>
    </section>

    {data.sponsors.length > 0 && <section style={{ marginTop: 18, padding: 22, border: "1px solid #dbe3ef", borderRadius: 16 }}>
      <h2 style={{ marginTop: 0 }}>Thank You To Our Sponsors</h2>
      <p style={{ color: "#475569", marginTop: 0 }}>Local businesses help keep BandWagon free. Sponsors never receive information about the families or students who use it.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        {data.sponsors.map((s: Record<string, string | null>, index: number) => {
          const inner = <>{s.logo_url && <img src={s.logo_url} alt="" referrerPolicy="no-referrer" style={{ width: 48, height: 48, objectFit: "contain" }} />}<span><strong>{s.sponsor_name}</strong>{s.tier_label ? <span style={{ display: "block", fontSize: 12, color: "#64748b" }}>{s.tier_label}</span> : null}</span></>;
          const style = { display: "flex", gap: 10, alignItems: "center", padding: 12, border: "1px solid #dbe3ef", borderRadius: 12, color: "#0f172a", textDecoration: "none" } as const;
          return s.sponsor_website
            ? <a key={index} href={s.sponsor_website} target="_blank" rel="noopener noreferrer nofollow sponsored" style={style}>{inner}</a>
            : <div key={index} style={style}>{inner}</div>;
        })}
      </div>
    </section>}

    <p style={{ fontSize: 13, color: "#64748b" }}>Updated {new Date(data.generatedAt).toISOString().slice(0, 10)}.</p>
  </main>;
}
