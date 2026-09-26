import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { platformBrand } from "@/lib/branding";
import { resolveBranding } from "@/lib/branding-policy";
import { resolveTenant } from "@/lib/tenant";
import ProductHome from "./ProductHome";

const productTitle = "BandWagon for Organizations: private carpools for trusted groups";
const productDescription =
  "Free, privacy-first carpool coordination for school bands, teams, troops, and other trusted groups. Guardian controlled, no live tracking, and never sells data.";

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await resolveTenant();
  // Tenant hosts keep the layout defaults. Only the product site gets the
  // "For Organizations" title and share card.
  if (tenant.type === "organization") return {};
  return {
    title: { absolute: productTitle },
    description: productDescription,
    alternates: { canonical: "/" },
    openGraph: {
      title: productTitle,
      description: productDescription,
      url: "/",
      siteName: "BandWagon",
      images: [{ url: "/social/bandwagon-social.png", width: 1280, height: 640, alt: "BandWagon - Community-powered rides" }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: productTitle,
      description: productDescription,
      images: ["/social/bandwagon-social.png"],
    },
  };
}

export default async function Home() {
  const tenant = await resolveTenant();
  // The platform host is the public product site for organizations.
  if (tenant.type !== "organization") return <ProductHome />;
  // Each community's own branding (set in /admin/branding), with safe defaults.
  const org = resolveBranding({ displayName: tenant.displayName, name: tenant.name, branding: tenant.branding });
  const themed = { "--gold": org.accentColor } as CSSProperties;

  return (
    <main className="home-shell" style={themed}>
      <section className="home-hero" aria-labelledby="home-heading">
        <div className="hero-copy">
          <div className="hero-kicker"><span aria-hidden="true">●</span> Privacy-first community transportation</div>
          <div className="eyebrow">A {platformBrand.vendorName} product</div>
          {org.logoUrl && <img src={org.logoUrl} alt={`${org.name} logo`} referrerPolicy="no-referrer" style={{ width: 72, height: 72, objectFit: "contain", borderRadius: 16, background: "#fff", padding: 6, marginBottom: 12 }} />}
          {org.communityName && <div className="eyebrow">{org.communityName}</div>}
          <h1 id="home-heading">{org.name}</h1>
          <p className="hero-lede">{org.tagline}</p>
          {org.welcomeText && <p className="hero-lede" style={{ whiteSpace: "pre-line", fontSize: "1rem" }}>{org.welcomeText}</p>}
          <div className="actions">
            <Link className="button" href="/login">Get started <span aria-hidden="true">→</span></Link>
            <Link className="button ghost" href="/help">See how it works</Link>
          </div>
          <div className="hero-trust" aria-label="Platform commitments">
            <span>Organization isolated</span><span>Guardian controlled</span>
          </div>
        </div>

        <div className="ride-preview" aria-label="Example BandWagon ride workflow">
          <div className="preview-topline"><span>Saturday rehearsal</span><span className="status-pill">Ride matched</span></div>
          <div className="route-line" aria-hidden="true"><span></span><i></i><span></span><i></i><span></span></div>
          <ol className="ride-steps">
            <li><span className="step-icon">1</span><div><strong>Request made</strong><small>General area shared</small></div><time>8:10 AM</time></li>
            <li><span className="step-icon">2</span><div><strong>Trusted driver matched</strong><small>Guardian approved</small></div><time>8:22 AM</time></li>
            <li><span className="step-icon verified">✓</span><div><strong>Pickup verified</strong><small>Exact details stay private</small></div><time>9:00 AM</time></li>
          </ol>
          <div className="privacy-chip"><span aria-hidden="true">◆</span><div><strong>Privacy by design</strong><small>No passive location tracking</small></div></div>
        </div>
      </section>

      <section className="independence-notice">
        <span className="notice-icon" aria-hidden="true">i</span>
        <div><strong>Independent coordination platform.</strong> BandWagon connects community members who voluntarily coordinate transportation. It does not provide, supervise, track, verify, or guarantee transportation.</div>
      </section>

      <section className="feature-section" aria-labelledby="features-heading">
        <div className="section-heading">
          <div className="eyebrow">Built for real community logistics</div>
          <h2 id="features-heading">Less coordination work. Better privacy.</h2>
          <p>Purpose-built tools replace spreadsheets, reply-all chains, and tangled message threads.</p>
        </div>
        <div className="feature-grid">
          <article className="feature-card"><span className="feature-number">01</span><h3>Simple scheduling</h3><p>Import Google or Microsoft calendars, create organizer events, and coordinate one-way or round-trip rides.</p></article>
          <article className="feature-card"><span className="feature-number">02</span><h3>Safer connections</h3><p>Organization rules, guardian approvals, driver eligibility, and verified pickup are built into the workflow.</p></article>
          <article className="feature-card"><span className="feature-number">03</span><h3>Private by default</h3><p>Exact addresses stay protected until authorized participants need them. There is no public rating system or passive tracking.</p></article>
        </div>
      </section>

      <section className="community-banner">
        <div><div className="eyebrow">Ready when your community is</div><h2>Plan the ride. Protect the people.</h2><p>Use BandWagon on the web, install it as an app, or review the code on GitHub before your organization adopts it.</p></div>
        <div className="actions">
          <Link className="button light" href="/login">Sign in</Link>
          <a className="button outline-light" href="/api/review-package">Review package</a>
          <a className="button outline-light" href="https://github.com/harrisonwardtechnology/BandWagon">GitHub</a>
        </div>
      </section>
    </main>
  );
}
