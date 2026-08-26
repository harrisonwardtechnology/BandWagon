import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { floMoGoBrand, platformBrand } from "@/lib/branding";
import { resolveTenant } from "@/lib/tenant";

export default async function Home() {
  const tenant = await resolveTenant();
  const org = tenant.type === "organization" ? floMoGoBrand : undefined;

  return (
    <main className="home-shell">
      <nav className="home-nav" aria-label="Primary navigation">
        <BrandLogo priority />
        <div className="home-nav-links">
          <Link href="/help">Help</Link>
          <Link href="/privacy">Privacy</Link>
          <Link className="nav-sign-in" href="/login">Sign in</Link>
        </div>
      </nav>

      <section className="home-hero" aria-labelledby="home-heading">
        <div className="hero-copy">
          <div className="hero-kicker"><span aria-hidden="true">●</span> Privacy-first community transportation</div>
          <div className="eyebrow">A {platformBrand.vendorName} product</div>
          <h1 id="home-heading">{org?.name || "Community rides, without the logistics web."}</h1>
          <p className="hero-lede">{org?.tagline || "Bring families, drivers, events, and ride details together—without public addresses, live tracking, or chaotic group messages."}</p>
          <div className="actions">
            <Link className="button" href="/login">Get started <span aria-hidden="true">→</span></Link>
            <Link className="button ghost" href="/help">See how it works</Link>
          </div>
          <div className="hero-trust" aria-label="Platform commitments">
            <span>Open source</span><span>Organization isolated</span><span>Guardian controlled</span>
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
        <div><div className="eyebrow">Ready when your community is</div><h2>Plan the ride. Protect the people.</h2><p>Use BandWagon on the web, install it as an app, or review the open-source project before your organization adopts it.</p></div>
        <div className="actions">
          <Link className="button light" href="/login">Sign in</Link>
          <a className="button outline-light" href="/api/review-package">Review package</a>
          <a className="button outline-light" href="https://github.com/harrisonwardtechnology/BandWagon">GitHub</a>
        </div>
      </section>
    </main>
  );
}
