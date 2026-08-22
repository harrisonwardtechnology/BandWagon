import Link from "next/link";

export const metadata = {
  title: "Terms of Use | BandWagon",
  description: "BandWagon terms of use and transportation coordination terms."
};

export default function TermsPage() {
  return (
    <main className="shell legal-shell">
      <header className="legal-header">
        <Link className="brand-link" href="/">BandWagon</Link>
        <div className="eyebrow">A Harrison Ward Technology product</div>
        <h1>Terms of Use</h1>
        <p>Effective August 21, 2026</p>
      </header>

      <section className="notice">
        <strong>Important:</strong> BandWagon only helps community members connect. It does not provide, dispatch, supervise, monitor, certify, or guarantee transportation.
      </section>

      <article className="legal-card">
        <h2>1. Independent Third-Party Service</h2>
        <p>BandWagon is an independent product operated by Harrison Ward Technology. It is not owned, operated, sponsored, endorsed, supervised, or managed by any school, school district, band program, booster organization, sports organization, church, nonprofit, association, or governing body whose members may use it. References to organizations or groups are solely for the purpose of helping users identify and connect with their community.</p>

        <h2>2. Coordination Only</h2>
        <p>BandWagon is a technology platform for voluntary community ride coordination. BandWagon does not provide transportation, employ drivers, dispatch vehicles, select drivers, inspect vehicles, conduct background checks, determine driver fitness, verify licensing or insurance, supervise passengers, monitor routes, or guarantee any ride.</p>
        <p>Users and household managers are solely responsible for deciding whether they are comfortable requesting, offering, accepting, or providing transportation with another member.</p>

        <h2>3. Eligibility and Accounts</h2>
        <p>Users must provide accurate account information and maintain control of their verified email and any verified mobile number. Organization or household rules may impose additional eligibility requirements. Household managers may control permissions for minors associated with their household.</p>

        <h2>4. Organization and Group Membership</h2>
        <p>Membership may require a registration code, invitation, or organization approval. Membership in BandWagon does not represent certification, endorsement, or approval of a person's suitability to transport another person.</p>

        <h2>5. Ride Requests and Offers</h2>
        <p>Ride requests, offers, matches, confirmations, pickup/drop-off status, and related actions represent communications between users. A confirmed match is not a transportation contract with Harrison Ward Technology or BandWagon.</p>

        <h2>6. No Emergency Use</h2>
        <p>BandWagon is not an emergency transportation or emergency communication service. Users should contact appropriate emergency services when immediate assistance is required.</p>

        <h2>7. SMS/RCS Messaging Terms</h2>
        <p>Users may voluntarily opt in to BandWagon SMS/RCS messaging. Messages may include account verification, ride requests, offers, confirmations, schedule changes, reminders, pickup/drop-off status, cancellations, and other transactional service communications. Message frequency varies. Message and data rates may apply.</p>
        <p>To stop SMS/RCS messages, reply <strong>STOP</strong>. For assistance, reply <strong>HELP</strong> or use the BandWagon support/contact process. Carriers are not liable for delayed or undelivered messages. Mobile messaging consent is optional and is not a condition of creating or using a BandWagon account where email communication is available.</p>

        <h2>8. User Conduct</h2>
        <p>Users may not misuse the platform, harass other members, circumvent blocks or privacy controls, impersonate another person, scrape member information, send spam, attempt unauthorized access, or use BandWagon for illegal or abusive activity.</p>

        <h2>9. Blocking, Suspension, and Termination</h2>
        <p>Users may block other accounts. Organization administrators may restrict organization-scoped access where authorized, and BandWagon may suspend or terminate accounts or organizations for abuse, security threats, legal requirements, or material violations of these Terms.</p>

        <h2>10. Privacy</h2>
        <p>Use of BandWagon is also governed by the <Link href="/privacy">Privacy Policy</Link>. Users should review the public <Link href="/messaging">Messaging & SMS Consent</Link> page before enabling mobile messaging.</p>

        <h2>11. Availability and Changes</h2>
        <p>The service may change, experience downtime, or be discontinued. Calendar events, notifications, messages, and ride information may be delayed or unavailable due to systems outside BandWagon's control.</p>

        <h2>12. Disclaimers and Liability</h2>
        <p>BandWagon is provided as a coordination tool. Transportation decisions and transportation itself occur independently between users. Final warranty disclaimers, limitation-of-liability terms, indemnification provisions, dispute-resolution terms, and jurisdiction-specific legal provisions will be reviewed by qualified counsel before broad public use.</p>

        <h2>13. Changes to These Terms</h2>
        <p>These Terms may be updated as the platform evolves. Material changes may require renewed acknowledgment.</p>

        <h2>14. Contact</h2>
        <p>Questions about these Terms may be submitted to Harrison Ward Technology through BandWagon's public support/contact process.</p>

        <div className="legal-links">
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/messaging">Messaging & SMS Consent</Link>
          <Link href="/">BandWagon Home</Link>
        </div>
      </article>
    </main>
  );
}
