import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | BandWagon",
  description: "BandWagon privacy policy and data handling practices."
};

export default function PrivacyPage() {
  return (
    <main className="shell legal-shell">
      <header className="legal-header">
        <Link className="brand-link" href="/">BandWagon</Link>
        <div className="eyebrow">A Harrison Ward Technology product</div>
        <h1>Privacy Policy</h1>
        <p>Effective August 21, 2026</p>
      </header>

      <section className="notice">
        <strong>Independent third-party service.</strong> BandWagon is independently operated by Harrison Ward Technology. It is not owned, operated, sponsored, endorsed, supervised, or managed by any school, school district, band program, booster organization, sports organization, church, nonprofit, association, or governing body whose members may use the service.
      </section>

      <article className="legal-card">
        <h2>1. What BandWagon Does</h2>
        <p>BandWagon is a community ride-coordination platform. It helps users voluntarily connect with one another to request, offer, and coordinate transportation. BandWagon does not provide transportation, employ or dispatch drivers, inspect vehicles, conduct background checks, verify insurance or licensing, supervise rides, track vehicles, or guarantee any transportation arrangement.</p>

        <h2>2. Information We Collect</h2>
        <p>Depending on how you use the service, BandWagon may collect:</p>
        <ul>
          <li>Name, display name, email address, and optional mobile phone number.</li>
          <li>Household relationships, organization and group memberships, and account roles.</li>
          <li>Driver profile information, service areas, availability, and passenger capacity.</li>
          <li>Ride requests, offers, matches, pickup/drop-off confirmations, cancellations, and related operational records.</li>
          <li>Addresses, approximate geographic areas, and user-drawn service areas when needed for ride coordination.</li>
          <li>Email, SMS, and RCS notification preferences and consent records.</li>
          <li>Security, authentication, audit, and device/session information needed to protect the service.</li>
        </ul>

        <h2>3. Location Privacy</h2>
        <p>Exact home, pickup, and drop-off addresses are treated as private information. They are not displayed to the general community. BandWagon uses general areas and user-selected service areas for discovery and matching whenever possible. Exact locations are disclosed only to authorized participants when reasonably necessary to complete a confirmed ride.</p>
        <p>BandWagon does not provide live GPS tracking, route monitoring, vehicle telemetry, speed monitoring, or background location collection.</p>

        <h2>4. Children and Household Accounts</h2>
        <p>Parents or household managers may create and manage profiles for household members, including minors. A household manager may control whether a minor can request rides independently or whether parent/guardian approval is required. A minor may have a separate verified email or phone number when the household permits it.</p>

        <h2>5. SMS, RCS, and Mobile Information</h2>
        <p>Mobile messaging is optional. When a user voluntarily provides a mobile number and explicitly opts in, BandWagon may send transactional messages about account verification, ride requests, ride offers, confirmations, changes, reminders, pickup/drop-off status, cancellations, and other service-related activity. Message frequency varies. Message and data rates may apply.</p>
        <p><strong>Mobile information, including phone numbers and SMS/RCS consent data, will not be sold, rented, or shared with third parties or affiliates for marketing or promotional purposes.</strong> Mobile information may be provided to service providers such as telecommunications carriers and messaging processors only as necessary to deliver the communications requested by the user or to operate and secure the service.</p>
        <p>Users may reply <strong>STOP</strong> to opt out of SMS/RCS messaging and <strong>HELP</strong> for assistance. Opting out of mobile messaging does not delete the user's BandWagon account and does not prevent the user from selecting email notifications where available.</p>

        <h2>6. Email and Communication Preferences</h2>
        <p>A verified email address is required for a BandWagon account. Users may choose email, SMS/RCS, or both for supported operational notifications. Certain important security, privacy, account, or legal notices may be sent to the verified email address regardless of optional ride-notification preferences.</p>

        <h2>7. How Information Is Shared</h2>
        <p>BandWagon minimizes disclosure. Before a ride is confirmed, other members generally see only the information needed to determine whether they may be able to help, such as the event, general area, number of passengers, and transportation notes. After a ride is confirmed, authorized participants may receive additional information reasonably necessary to coordinate the ride. Phone numbers and email addresses remain hidden when the user's privacy settings require platform-mediated communication.</p>

        <h2>8. Service Providers and Subprocessors</h2>
        <p>BandWagon may use third-party infrastructure and service providers for hosting, databases, email delivery, SMS/RCS messaging, maps/geocoding, and Google or Microsoft calendar integrations. These providers process information only as necessary to provide their services to BandWagon.</p>

        <h2>9. Data Retention</h2>
        <p>BandWagon is designed to retain only information reasonably necessary to operate, secure, and support the service. Exact ride locations are intended to have shorter retention than generalized ride history. Security, consent, and audit records may be retained longer when reasonably necessary for security, fraud prevention, legal obligations, or service integrity.</p>

        <h2>10. Your Privacy Choices</h2>
        <p>Users can manage contact visibility, notification methods, blocked accounts, driver availability, and other privacy settings. BandWagon is designed to provide data access/export and account deletion workflows.</p>

        <h2>11. Right to Delete / Be Forgotten</h2>
        <p>Users may request deletion of their account and personal information. BandWagon will delete or anonymize personal information that is no longer reasonably necessary, subject to limited retention required for security, consent records, legal obligations, fraud prevention, dispute handling, or database integrity.</p>

        <h2>12. Security</h2>
        <p>BandWagon uses administrative and technical safeguards including access controls, encryption, tenant isolation, authentication, audit logging, rate limiting, secure secret management, and security monitoring. No internet-connected system can guarantee absolute security.</p>

        <h2>13. No Sale of Personal Information</h2>
        <p>BandWagon does not sell personal information.</p>

        <h2>14. Changes to This Policy</h2>
        <p>BandWagon may update this Privacy Policy as the product evolves or legal requirements change. Material changes may require renewed acknowledgment or consent where appropriate.</p>

        <h2>15. Contact</h2>
        <p>Privacy, data access, deletion, or other questions may be submitted to Harrison Ward Technology through the BandWagon support/contact process. Dedicated support, privacy, and security addresses will be published as the service moves from production scaffold to public registration.</p>

        <div className="legal-links">
          <Link href="/terms">Terms of Use</Link>
          <Link href="/messaging">Messaging & SMS Consent</Link>
          <Link href="/">BandWagon Home</Link>
        </div>
      </article>
    </main>
  );
}
