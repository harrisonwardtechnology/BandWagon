import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | BandWagon",
  description: "BandWagon privacy policy and explicit data handling practices."
};

export default function PrivacyPage() {
  return <main className="shell legal-shell">
    <header className="legal-header">
      <Link className="brand-link" href="/">BandWagon</Link>
      <div className="eyebrow">A Harrison Ward Technology product</div>
      <h1>Privacy Policy</h1>
      <p>Effective August 26, 2026</p>
    </header>

    <section className="notice"><strong>Independent third-party service.</strong> BandWagon is independently operated by Harrison Ward Technology. It is not owned, operated, sponsored, endorsed, supervised, or managed by any school, school district, band program, booster organization, sports organization, church, nonprofit, association, or governing body whose members may use the service.</section>

    <article className="legal-card">
      <h2>1. Controller and Scope</h2>
      <p>Harrison Ward Technology, located in Flower Mound, Texas, United States, operates BandWagon and determines how platform personal information is processed. In privacy-law terminology, Harrison Ward Technology is generally the controller for the BandWagon platform. A participating organization may separately control information it submits, organization policies, membership decisions, and organization-specific uses.</p>
      <p>This policy applies to BandWagon websites, progressive web applications, organization instances such as FloMoGo, support processes, and related ride-coordination services. Questions may be submitted through the <Link href="/help">Help Center</Link> or to <a href="mailto:help+privacy@harrisonward.com">help+privacy@harrisonward.com</a>.</p>

      <h2>2. What BandWagon Does</h2>
      <p>BandWagon is a community ride-coordination platform. It helps users voluntarily connect to request, offer, and coordinate transportation. BandWagon does not provide transportation, employ or dispatch drivers, inspect vehicles, conduct background checks unless specifically disclosed, verify insurance or licensing, supervise rides, track vehicles, or guarantee an arrangement.</p>

      <h2>3. Information Collected</h2>
      <ul>
        <li><strong>Identity and account:</strong> name, display name, email, optional mobile number, birth month/year or age classification, authentication and session records.</li>
        <li><strong>Household and organization:</strong> guardian relationships, household members, organization/group memberships, roles, approvals, and policy acknowledgements.</li>
        <li><strong>Ride and event:</strong> requests, offers, matches, schedules, passenger counts, transportation notes, pickup/drop-off confirmations, cancellations, no-shows, and operational history.</li>
        <li><strong>Location:</strong> private addresses, event locations, approximate geographic areas, and user-drawn service areas when necessary for coordination.</li>
        <li><strong>Driver eligibility:</strong> profile, availability, capacity, service area, and organization-required credentials or approval records.</li>
        <li><strong>Communications:</strong> email, push, SMS/RCS preferences, consent/opt-out records, delivery status, and transactional message history.</li>
        <li><strong>Calendar connections:</strong> account identifiers, selected calendars, imported event details, encrypted OAuth credentials, synchronization status, and errors.</li>
        <li><strong>Security and support:</strong> IP address, browser/device details, audit events, abuse signals, support requests, security reports, and administrator support-mode activity.</li>
        <li><strong>Payments:</strong> support amount, status, Stripe reference, and sponsor details. Payment-card information is entered on Stripe-hosted Checkout and is not stored by BandWagon.</li>
      </ul>

      <h2>4. Sources</h2>
      <p>Information comes from users, parents or guardians, household managers, participating organizations, connected Google or Microsoft accounts, service providers involved in a requested transaction, and platform-generated security or operational records. BandWagon does not purchase consumer marketing profiles or obtain data from data brokers.</p>

      <h2>5. Purposes and Legal Bases</h2>
      <p>Where applicable law requires a legal basis, BandWagon relies on the following:</p>
      <div className="legal-table-wrap"><table className="legal-table"><thead><tr><th>Purpose</th><th>Typical legal basis</th></tr></thead><tbody>
        <tr><td>Create accounts; coordinate rides and events; provide requested calendars, notifications, support, and privacy functions.</td><td>Performance of the requested service or steps taken at the user's request.</td></tr>
        <tr><td>Optional SMS/RCS, push notifications, calendar connections, AI-assisted features, and optional functional browser storage.</td><td>Consent or an explicit user/organization request; consent may be withdrawn.</td></tr>
        <tr><td>Prevent abuse, protect minors and locations, secure accounts, investigate incidents, maintain audit trails, and operate reliable infrastructure.</td><td>Legitimate interests in safety, security, fraud prevention, and service integrity, balanced against individual rights.</td></tr>
        <tr><td>Maintain legally required records, respond to valid legal process, and enforce rights.</td><td>Legal obligation and establishment, exercise, or defense of legal claims where applicable.</td></tr>
      </tbody></table></div>

      <h2>6. Location Privacy</h2>
      <p>Exact home, pickup, and drop-off addresses are private. They are not shown to the general community. General areas and user-selected service areas are used for discovery and matching whenever practical. Exact information is disclosed only to authorized participants when reasonably necessary for a confirmed ride.</p>
      <p>BandWagon does not provide continuous GPS tracking, route monitoring, vehicle telemetry, speed monitoring, advertising geofencing, or background location collection.</p>

      <h2>7. Children, Teens, and Guardian Authority</h2>
      <p>BandWagon is designed for adults, families, and organization-managed communities; it is not an unrestricted child-directed social service. A parent or authorized household manager may create and control a managed profile for a minor. Direct sign-in for a managed student requires organization enablement, verified contact information, and active guardian consent. Organizations and guardians may require approval before a minor requests a ride.</p>
      <p>BandWagon does not knowingly permit an independent account for a child under 13 without the notice, authorization, and verifiable parental consent required by applicable law. A parent or guardian may review, correct, export, restrict, or request deletion of a managed child's information. Concerns about an unauthorized minor account should be reported immediately through the Help Center.</p>

      <h2>8. SMS, RCS, Email, and Push</h2>
      <p>Mobile messaging is optional and limited to transactional account, ride, event, verification, safety, and service activity. Message frequency varies and message/data rates may apply. Reply <strong>STOP</strong> to opt out and <strong>HELP</strong> for assistance. Mobile information and consent records are not sold, rented, or shared with third parties or affiliates for marketing or promotional purposes.</p>
      <p>A verified email is required for an account. Important security, privacy, account, safety, or legal notices may be sent even when optional ride notices are disabled. Browser push is requested only after the user selects the enable action and may be disabled through BandWagon or device settings.</p>

      <h2>9. Sharing and Disclosure</h2>
      <p>BandWagon limits disclosure to what is reasonably needed:</p>
      <ul>
        <li>Authorized ride participants receive information needed to evaluate or complete a ride, with exact locations withheld until appropriate.</li>
        <li>Parents, guardians, household managers, and organization administrators receive information permitted by their verified role.</li>
        <li>Service providers process limited information necessary for hosting, storage, email, messaging, maps, calendars, bot protection, payment, monitoring, and security.</li>
        <li>Information may be disclosed when required by valid legal process, to protect a person from serious harm, to investigate abuse or fraud, or in a business reorganization subject to continued privacy protections.</li>
      </ul>
      <p>BandWagon does not sell personal information. It does not share personal information for cross-context behavioral advertising and does not use personal information for targeted advertising.</p>

      <h2>10. Service Providers</h2>
      <p>Current provider categories include IONOS and Coolify-managed infrastructure, PostgreSQL and private object storage, Cloudflare security/Turnstile, Twilio SMS/RCS, email delivery providers, Google Maps/Routes and Google Calendar, Microsoft Graph Calendar, Stripe-hosted Checkout, and platform monitoring services. A provider receives only the information necessary for its function and is subject to applicable contractual, confidentiality, security, and data-protection requirements.</p>

      <h2>11. Cookies and Similar Technology</h2>
      <p>BandWagon uses essential cookies for authentication, security, temporary support mode, and remembering privacy choices. Optional functional storage for the offline PWA shell remains off until allowed. BandWagon does not currently use advertising cookies, cross-site tracking, session replay, or behavioral analytics. Exact names, durations, providers, and controls appear in the <Link href="/cookies">Cookie and Similar Technologies Policy</Link>.</p>

      <h2>12. Retention and Deletion</h2>
      <p>BandWagon retains information only as long as reasonably necessary for the stated purpose, organization configuration, safety, security, legal obligations, disputes, and service integrity:</p>
      <ul>
        <li>Exact completed/cancelled ride locations default to deletion after 30 days; organizations may configure 1–365 days.</li>
        <li>Driver credential documents default to 90 days after expiration, rejection, or replacement; organization settings may vary within platform limits.</li>
        <li>Authentication challenges, expired sessions, and related artifacts are regularly expired, revoked, redacted, or removed by privacy maintenance.</li>
        <li>Account-deletion requests normally include a seven-day safety grace period before eligible direct personal information is removed.</li>
        <li>Minimum de-identified or restricted safety, consent, security, billing, audit, and ride-integrity records may remain when reasonably necessary.</li>
        <li>Backups expire under the infrastructure backup-retention schedule; deleted data may remain inaccessible in encrypted backups until rotation.</li>
      </ul>

      <h2>13. Individual Rights and Requests</h2>
      <p>Depending on location and applicable law, a person may have rights to know/access, correct, delete, obtain a portable copy, restrict processing, object to certain processing, withdraw consent, opt out of sale/targeted advertising/profiling, use an authorized agent, appeal a denied request, and complain to a regulator. BandWagon does not discriminate against users for exercising privacy rights.</p>
      <p>Signed-in users can export data and schedule/cancel account deletion from <Link href="/app/settings/privacy">Privacy &amp; Data</Link>. Other requests may use the Help Center's Privacy Request topic. BandWagon may verify identity and authority before fulfilling a request. Where GDPR applies, users may complain to the data-protection authority in their country. Texas residents may submit applicable complaints to the Texas Attorney General after using BandWagon's request process.</p>

      <h2>14. International Processing</h2>
      <p>BandWagon is operated from the United States and is designed to use United States production hosting. Some providers may process support, routing, messaging, calendar, security, or resilience data from other locations. Where a restricted international transfer is subject to applicable law, BandWagon uses an approved transfer mechanism and supplementary safeguards where required.</p>

      <h2>15. Security</h2>
      <p>Safeguards include encryption in transit and at rest, field-level protection for selected sensitive data, tenant isolation, role-based access, guardian authority checks, short-lived verification codes, secure session controls, audit logging, rate limiting, restricted support mode, secret management, bot protection, monitoring, retention automation, and incident handling. No internet-connected service can guarantee absolute security.</p>

      <h2>16. Automated Processing and AI</h2>
      <p>BandWagon does not make solely automated decisions that produce legal or similarly significant effects. Optional AI-assisted intake or document extraction is controlled by organization opt-in and runtime configuration; it does not replace required human organization review. BandWagon does not use submitted content to build advertising profiles.</p>

      <h2>17. Changes and Re-consent</h2>
      <p>Material policy changes may require renewed acknowledgement or consent. A new optional cookie/storage category, materially different purpose, or new tracking provider will not be authorized by an old functional-storage choice; BandWagon will update the policy version and ask again before activation where consent is required.</p>

      <h2>18. Contact and Complaints</h2>
      <p><strong>Controller:</strong> Harrison Ward Technology, Flower Mound, Texas, United States<br/><strong>Privacy:</strong> <a href="mailto:help+privacy@harrisonward.com">help+privacy@harrisonward.com</a> or the <Link href="/help">Help Center</Link><br/><strong>Security:</strong> <a href="mailto:help+security@harrisonward.com">help+security@harrisonward.com</a> or the <Link href="/security">Security Report</Link> process<br/><strong>Support:</strong> <a href="mailto:help+support@harrisonward.com">help+support@harrisonward.com</a></p>

      <div className="legal-links"><Link href="/cookies">Cookie Policy</Link><Link href="/terms">Terms of Use</Link><Link href="/messaging">Messaging &amp; SMS Consent</Link><Link href="/help">Privacy Request</Link><Link href="/">BandWagon Home</Link></div>
    </article>
  </main>;
}
