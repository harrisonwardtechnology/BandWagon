import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { platformBrand } from "@/lib/branding";
import { resolveBranding } from "@/lib/branding-policy";
import { resolveTenant } from "@/lib/tenant";
import { legacyTenantBaseDomains, tenantBaseDomain } from "@/lib/platform-hosts";
import { isStagingEnvironment } from "@/lib/public-links";
import { NOINDEX, OG_IMAGE, publicPageMetadata, TWITTER_IMAGE } from "@/lib/seo";
import { tenantCanonicalOrigin } from "@/lib/seo-policy";
import ProductHome from "./ProductHome";

const productTitle = "BandWagon: Free Community Carpools For Schools, Bands, And Teams";
const productDescription =
  "Free, privacy-first carpool coordination for school bands, teams, clubs, troops, and other trusted groups. Guardian controlled, no live tracking, and never sells data.";

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await resolveTenant();
  if (tenant.type === "organization") {
    // A community's landing page: its own name, canonical on its own host.
    // Only this page may be indexed on a community host. Everything else there
    // is noindex (robots.ts and the middleware X-Robots-Tag). follow:false
    // keeps crawlers from walking into sign-in links.
    const org = resolveBranding({ displayName: tenant.displayName, name: tenant.name, branding: tenant.branding });
    const origin = tenantCanonicalOrigin({ primaryHostname: tenant.primaryHostname, hostname: tenant.hostname, tenantBase: tenantBaseDomain(), legacyTenantBases: legacyTenantBaseDomains() });
    const description = `${org.name} uses BandWagon to coordinate carpools for its families. ${org.tagline}`.slice(0, 300);
    return {
      title: { absolute: `${org.name} carpools on BandWagon` },
      description,
      applicationName: org.name,
      alternates: { canonical: `${origin}/` },
      openGraph: { title: org.name, description, url: `${origin}/`, siteName: org.name, type: "website", images: [OG_IMAGE] },
      twitter: { card: "summary_large_image", title: org.name, description, images: [TWITTER_IMAGE] },
      robots: isStagingEnvironment() ? NOINDEX : { index: true, follow: false },
    };
  }
  return publicPageMetadata({ title: productTitle, description: productDescription, path: "/", absoluteTitle: true });
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
          <div className="hero-kicker"><span aria-hidden="true">●</span> Privacy-First Community Transportation</div>
          <div className="eyebrow">A {platformBrand.vendorName} product</div>
          {org.logoUrl && <img src={org.logoUrl} alt={`${org.name} logo`} referrerPolicy="no-referrer" style={{ width: 72, height: 72, objectFit: "contain", borderRadius: 16, background: "var(--surface)", padding: 6, marginBottom: 12 }} />}
          {org.communityName && <div className="eyebrow">{org.communityName}</div>}
          <h1 id="home-heading">{org.name}</h1>
          <p className="hero-lede">{org.tagline}</p>
          {org.welcomeText && <p className="hero-lede" style={{ whiteSpace: "pre-line", fontSize: "1rem" }}>{org.welcomeText}</p>}
          <div className="actions">
            <Link className="button" href="/login">Get Started <ArrowRight className="icon" aria-hidden="true" /></Link>
            <Link className="button ghost" href="/help">See How It Works</Link>
          </div>
          <div className="hero-trust" aria-label="Platform commitments">
            <span>Organization Isolated</span><span>Guardian Controlled</span>
          </div>
        </div>

        <div className="ride-preview" aria-label="Example BandWagon ride workflow">
          <div className="preview-topline"><span>Saturday Rehearsal</span><span className="status-pill">Ride Matched</span></div>
          <div className="route-line" aria-hidden="true"><span></span><i></i><span></span><i></i><span></span></div>
          <ol className="ride-steps">
            <li><span className="step-icon">1</span><div><strong>Request Made</strong><small>General Area Shared</small></div><time>8:10 AM</time></li>
            <li><span className="step-icon">2</span><div><strong>Trusted Driver Matched</strong><small>Guardian Approved</small></div><time>8:22 AM</time></li>
            <li><span className="step-icon verified"><Check className="icon" aria-hidden="true" /></span><div><strong>Pickup Verified</strong><small>Exact Details Stay Private</small></div><time>9:00 AM</time></li>
          </ol>
          <div className="privacy-chip"><span aria-hidden="true"><ShieldCheck className="icon" aria-hidden="true" /></span><div><strong>Privacy By Design</strong><small>No Passive Location Tracking</small></div></div>
        </div>
      </section>

      <section className="independence-notice">
        <span className="notice-icon" aria-hidden="true">i</span>
        <div><strong>Independent coordination platform.</strong> BandWagon connects community members who voluntarily coordinate transportation. It does not provide, supervise, track, verify, or guarantee transportation.</div>
      </section>

      <section className="feature-section" aria-labelledby="features-heading">
        <div className="section-heading">
          <div className="eyebrow">Built For Real Community Logistics</div>
          <h2 id="features-heading">Less coordination work. Better privacy.</h2>
          <p>Purpose-built tools replace spreadsheets, reply-all chains, and tangled message threads.</p>
        </div>
        <div className="feature-grid">
          <article className="feature-card"><span className="feature-number">01</span><h3>Simple Scheduling</h3><p>Import Google or Microsoft calendars, create organizer events, and coordinate one-way or round-trip rides.</p></article>
          <article className="feature-card"><span className="feature-number">02</span><h3>Safer Connections</h3><p>Organization rules, guardian approvals, driver eligibility, and verified pickup are built into the workflow.</p></article>
          <article className="feature-card"><span className="feature-number">03</span><h3>Private By Default</h3><p>Exact addresses stay protected until authorized participants need them. There is no public rating system or passive tracking.</p></article>
        </div>
      </section>

      <section className="community-banner">
        <div><div className="eyebrow">Ready When Your Community Is</div><h2>Plan the ride. Protect the people.</h2><p>Use BandWagon on the web, install it as an app, or review the code on GitHub before your organization adopts it.</p></div>
        <div className="actions">
          <Link className="button light" href="/login">Sign In</Link>
          <a className="button outline-light" href="/api/review-package">Review Package</a>
          <a className="button outline-light" href="https://github.com/harrisonwardtechnology/BandWagon">GitHub</a>
        </div>
      </section>
    </main>
  );
}
