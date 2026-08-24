import Link from "next/link";
import { floMoGoBrand, platformBrand } from "@/lib/branding";
import { resolveTenant } from "@/lib/tenant";

export default async function Home() {
  const tenant = await resolveTenant();
  const org = tenant.type === "organization" ? floMoGoBrand : undefined;
  return (
    <main className="shell">
      <header className="hero">
        <div className="brandmark">BW</div>
        <div>
          <div className="eyebrow">A {platformBrand.vendorName} product</div>
          <h1>{org?.name || platformBrand.name}</h1>
          <p>{org?.tagline || platformBrand.tagline}</p>
        </div>
      </header>

      <section className="notice">
        <strong>Independent third-party coordination service.</strong> BandWagon connects community members who voluntarily coordinate transportation. It does not provide, supervise, track, verify, or guarantee transportation.
      </section>

      <section className="grid">
        <article className="card primary">
          <div className="eyebrow">Community ride coordination</div>
          <h2>Plan the ride. Protect the people.</h2>
          <p>Join your organization, manage your household, coordinate event rides, and verify the right driver and rider at pickup—all with privacy and guardian controls built in.</p>
          <div className="actions">
            <Link className="button" href="/login">Sign in</Link>
            <Link className="button ghost" href="/help">Get help</Link>
            <a className="button ghost" href="https://github.com/harrisonwardtechnology/BandWagon">GitHub</a>
          </div>
        </article>
        <article className="card">
          <div className="eyebrow">Platform</div>
          <h3>BandWagon</h3>
          <p>Open-source, privacy-first community ride coordination.</p>
          <ul><li>No live tracking</li><li>No public ratings</li><li>Exact addresses protected</li><li>Organization isolation</li></ul>
        </article>
        <article className="card">
          <div className="eyebrow">First Community</div>
          <h3>FloMoGo</h3>
          <p>Ride coordination for the Flower Mound band community at <strong>flomogo.app</strong>.</p>
        </article>
      </section>

      <footer>
        <div>Powered by {platformBrand.name}, a {platformBrand.vendorName} product.</div>
        <div className="site-footer-links">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/messaging">Messaging & SMS Consent</Link>
        </div>
      </footer>
    </main>
  );
}
