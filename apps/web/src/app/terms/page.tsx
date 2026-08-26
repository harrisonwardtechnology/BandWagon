import Link from "next/link";

export const metadata = {
  title: "Terms of Use | BandWagon",
  description: "Terms of Use and messaging terms for BandWagon and FloMoGo."
};

export default function TermsPage() {
  return (
    <main className="shell legal-shell">
      <header className="legal-header">
        <Link className="brand-link" href="/">BandWagon</Link>
        <div className="eyebrow">A Harrison Ward Technology product</div>
        <h1>Terms of Use</h1>
        <p>Last updated: August 26, 2026</p>
      </header>

      <section className="notice">
        <strong>Important:</strong> BandWagon and FloMoGo are independent community
        coordination services. They are not transportation providers, do not operate
        vehicles, do not employ or supervise drivers, and do not guarantee rides.
      </section>

      <article className="legal-card">
        <h2>1. About BandWagon and FloMoGo</h2>
        <p>
          BandWagon is a community transportation coordination platform operated by
          Harrison Ward Technology. FloMoGo is an organization-facing service name
          powered by BandWagon. The service helps participating community members
          voluntarily find and communicate with one another about possible rides.
        </p>

        <h2>2. Independent Service and No Organizational Affiliation</h2>
        <p>
          Unless expressly stated otherwise for a particular organization, BandWagon,
          FloMoGo, and Harrison Ward Technology are independent third parties and are
          not affiliated with, sponsored by, endorsed by, operated by, or acting on
          behalf of any school, school district, band program, booster organization,
          governing body, or participating community organization.
        </p>

        <h2>3. Transportation Disclaimer and No Liability</h2>
        <p>
          BandWagon only introduces or connects people who may wish to coordinate
          transportation. BandWagon does not provide transportation, select or approve
          drivers, inspect vehicles, perform background checks unless specifically
          disclosed, supervise participants, verify insurance, determine fitness to
          drive, guarantee availability, or control the conduct of users.
        </p>
        <p>
          Drivers, passengers, parents, guardians, and household managers are solely
          responsible for deciding whether a ride arrangement is appropriate and for
          complying with applicable laws, licensing, insurance, supervision, safety,
          and parental or guardian requirements. Use of the service and participation
          in any ride arrangement are voluntary and at the participants' own risk.
        </p>

        <h2>4. No Location Tracking</h2>
        <p>
          BandWagon is not a live vehicle or person tracking service. The service may
          use addresses, map areas, event locations, and pickup or drop-off information
          to help users coordinate rides, but it does not continuously track a driver,
          passenger, child, vehicle, or device.
        </p>

        <h2>5. Accounts, Households, and Minors</h2>
        <p>
          Users must provide accurate account information and protect access to their
          accounts. Household managers may manage household members and, where
          configured, require approval of ride requests made by minors. Parents and
          guardians remain responsible for determining whether and how a minor may use
          the service and participate in a ride.
        </p>

        <h2>6. Acceptable Use</h2>
        <p>
          Users may not misuse the service, impersonate another person, submit
          knowingly false information, harass others, attempt unauthorized access,
          scrape private information, circumvent security or privacy controls, or use
          BandWagon for unlawful purposes. Accounts may be restricted, blocked, or
          removed to protect users or the service.
        </p>

        <h2>7. SMS Messaging Program</h2>
        <p>
          Users may optionally consent to receive recurring transactional SMS messages
          from BandWagon, including FloMoGo ride coordination messages. Messages may
          include ride requests, ride offers, confirmations, schedule changes,
          cancellations, reminders, pickup and drop-off status, account activity, and
          other ride-coordination notifications.
        </p>
        <p>
          <strong>Message frequency varies. Message and data rates may apply.</strong>
          SMS consent is optional and is not required to create or use a BandWagon
          account. Users who do not consent to SMS may use available email
          notifications instead.
        </p>
        <p>
          Reply <strong>STOP</strong> to opt out of SMS messages. Reply{" "}
          <strong>HELP</strong> for assistance. Carriers are not liable for delayed or
          undelivered messages.
        </p>
        <p>
          For assistance, use the contact information published on BandWagon or visit
          the <Link href="/messaging">Messaging &amp; SMS Consent</Link> page.
        </p>

        <h2>8. SMS Privacy</h2>
        <p>
          Mobile phone numbers, SMS opt-in information, and SMS consent information
          are not sold, rented, or shared with third parties or affiliates for
          marketing or promotional purposes. See the{" "}
          <Link href="/privacy">Privacy Policy</Link> for additional information.
        </p>

        <h2>9. Email and Service Communications</h2>
        <p>
          BandWagon may send service-related email, including account verification,
          security notices, ride coordination, reminders, and administrative
          communications. Notification preferences may be available depending on the
          message and organization configuration.
        </p>

        <h2>10. Ride Information and Privacy</h2>
        <p>
          Information visible to other users depends on the stage of a ride request
          and applicable privacy settings. BandWagon is designed to limit unnecessary
          disclosure of precise home addresses and personal contact information.
          Participants should only use information disclosed through the service for
          legitimate ride coordination.
        </p>

        <h2>11. Pickup and Drop-Off Confirmations</h2>
        <p>
          Pickup, drop-off, completion, no-show, or similar status features are
          coordination records supplied by users. They are not independent
          verification, monitoring, emergency response, or a guarantee of a person's
          location or safety.
        </p>

        <h2>12. Availability and Changes</h2>
        <p>
          The service may change, experience interruptions, or become unavailable.
          Features, notification methods, organization settings, and these Terms may
          be updated as the service develops.
        </p>

        <h2>13. Right to Stop Using the Service</h2>
        <p>
          Users may stop using BandWagon and may request deletion of eligible personal
          information in accordance with the Privacy Policy and applicable law.
          Certain information may be retained when reasonably necessary for security,
          legal, fraud-prevention, or operational recordkeeping purposes.
        </p>

        <h2>14. Privacy and Browser Storage</h2>
        <p>
          Use of personal information, cookies, service workers, browser storage, and
          similar technology is described in the <Link href="/privacy">Privacy Policy</Link> and{" "}
          <Link href="/cookies">Cookie and Similar Technologies Policy</Link>. Essential technology
          is used to provide and secure requested services. Optional browser storage remains off
          unless the user permits it and may be changed through Cookie preferences in the footer.
        </p>

        <h2>15. Contact</h2>
        <p>
          Questions, privacy requests, messaging assistance, or reports of misuse may
          be submitted using the contact method published on the BandWagon website.
        </p>

        <div className="legal-links">
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/cookies">Cookie Policy</Link>
          <Link href="/messaging">Messaging &amp; SMS Consent</Link>
          <Link href="/sms-opt-in">SMS Opt-In Example</Link>
          <Link href="/">BandWagon Home</Link>
        </div>
      </article>
    </main>
  );
}
