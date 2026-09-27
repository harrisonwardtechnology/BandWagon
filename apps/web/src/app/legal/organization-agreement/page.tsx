import type { Metadata } from "next";
import Link from "next/link";
import { LegalDraftBanner } from "@/components/legal-draft-banner";
import { SupportContact } from "@/components/support-contact";
import { ORGANIZATION_AGREEMENT_VERSION } from "@/lib/legal-versions";

export const metadata: Metadata = {
  title: "Organization Agreement (Draft)",
  description: "Draft agreement an organization leader accepts when requesting a BandWagon community.",
  alternates: { canonical: "/legal/organization-agreement" },
};

export default function OrganizationAgreementPage() {
  return (
    <main className="shell legal-shell">
      <header className="legal-header">
        <Link className="brand-link" href="/">BandWagon</Link>
        <div className="eyebrow">A Harrison Ward Technology product</div>
        <h1>Organization Agreement</h1>
        <p>Version {ORGANIZATION_AGREEMENT_VERSION}</p>
      </header>

      <LegalDraftBanner />

      <section className="notice">
        <strong>In short:</strong> BandWagon gives your group a free, private place to coordinate carpools. Your organization decides who joins and who may drive.
        Families decide about every ride. BandWagon and your organization are not transportation providers.
      </section>

      <article className="legal-card">
        <h2>1. Who this agreement is between</h2>
        <p>
          This agreement is between Harrison Ward Technology, LLC, a Texas limited liability company based in Flower Mound, Texas (&quot;HWTech&quot;, &quot;we&quot;, &quot;us&quot;), which operates BandWagon,
          and the organization named in the community request (&quot;Organization&quot;, &quot;you&quot;). The person who submits the request says they are allowed to accept this agreement for the Organization.
        </p>
        <p>
          This agreement works alongside the <Link href="/terms">Terms of Use</Link> and <Link href="/privacy">Privacy Policy</Link>, which apply to every person who uses BandWagon.
          If they conflict about the Organization&apos;s duties, this agreement controls.
        </p>

        <h2>2. What BandWagon is</h2>
        <p>
          BandWagon is software that helps members of a trusted group coordinate voluntary carpools. It lets families request and offer seats, match rides, send reminders, and confirm pickups.
        </p>
        <p>
          <strong>BandWagon is not a transportation provider, and neither are you because you use it.</strong> BandWagon does not provide rides, own or operate vehicles, employ, hire, pay, dispatch, or supervise drivers,
          or guarantee that any ride will happen. No one may charge or pay for a ride through BandWagon. It is not school transportation, a taxi, or a transportation network company.
        </p>

        <h2>3. Participation is voluntary</h2>
        <p>
          No family, student, or driver may be required to use BandWagon to take part in the Organization&apos;s activities. You agree to keep another way for families to get information and take part.
          Each parent or guardian decides whether their household joins, whether a student may ride, and whether to accept any ride.
        </p>

        <h2>4. Roles</h2>
        <ul>
          <li><strong>HWTech</strong> builds, hosts, secures, and supports the platform.</li>
          <li><strong>Organization admins</strong> are the people you name to run your community. They manage members, events, settings, and driver approval.</li>
          <li><strong>Parents and guardians</strong> manage their household and any students in it, and approve or decline rides.</li>
          <li><strong>Volunteer drivers</strong> are adults who choose to offer seats. They are responsible for their own driving, vehicle, license, and insurance.</li>
        </ul>

        <h2>5. Your admin duties</h2>
        <p>You agree that your admins will:</p>
        <ul>
          <li>Name at least one admin, and keep admin access limited to people who need it.</li>
          <li>Set driver requirements that fit your group, such as minimum age, license, insurance, district volunteer approval, and admin approval. Decide who meets them. BandWagon records your decision but does not certify drivers or run background checks.</li>
          <li>Remove or suspend any member or driver who breaks your rules, behaves unsafely, or misuses the service, as soon as you reasonably can.</li>
          <li>Keep your organization contact, privacy contact, and safety contact information current, so we can reach you about security, safety, or legal matters.</li>
          <li>Tell us promptly about any safety concern, suspected misuse, or security problem you learn about.</li>
          <li>Follow any rules that apply to your group, such as school, district, league, charter, or insurer requirements.</li>
        </ul>

        <h2>6. Acceptable use</h2>
        <p>You and your admins will not use BandWagon to:</p>
        <ul>
          <li>Charge for rides, collect ride payments, or run any commercial transportation service.</li>
          <li>Send marketing, fundraising blasts, or messages unrelated to your group&apos;s activities and rides.</li>
          <li>Collect information you do not need, or upload school records, student IDs, grades, health records, or similar sensitive records.</li>
          <li>Harass, threaten, or discriminate against anyone, or share someone&apos;s information without permission.</li>
          <li>Try to get around security, privacy, guardian, or tenant separation controls.</li>
          <li>Break any law, including privacy, anti-spam, and messaging consent laws.</li>
        </ul>

        <h2>7. Data ownership and processing</h2>
        <p>
          Members own the personal information they put into BandWagon. The Organization owns its own settings, events, and organization records. HWTech processes member information only to run,
          secure, support, and improve the service, to follow the law, and as described in the <Link href="/privacy">Privacy Policy</Link>.
        </p>
        <ul>
          <li>We never sell personal information, and we do not use it for targeted advertising.</li>
          <li>Donors and sponsors receive no participant data. Sponsorship never buys access to names, contact details, ride information, or reports about members.</li>
          <li>We use a limited set of service providers, listed on the <Link href="/legal/subprocessors">Subprocessors</Link> page. Some are used only if you turn on the related feature.</li>
          <li>Your admins can see only what their role allows. Exact addresses and driver documents stay protected even from most admins.</li>
          <li>Each community&apos;s data is kept separate from every other community.</li>
        </ul>

        <h2>8. Students, minors, and guardian control</h2>
        <p>
          BandWagon is built so a community can run without school records. A parent or guardian creates and controls any student profile. Students do not need their own account.
          If you turn on student sign-in, a guardian must still set it up and give consent, and can turn it off at any time. You agree not to create accounts for minors without a guardian.
          More detail is in the <Link href="/legal/student-data">Student Data Statement</Link>.
        </p>

        <h2>9. Security and incident notice</h2>
        <p>
          We protect data with encryption, access controls, audit logs, and monitoring. No online service can promise perfect security. If we confirm a security incident that affects your
          community&apos;s personal information, we will notify your listed contacts without unreasonable delay and share what we know, what we are doing, and what you may need to do. We will also
          give any notices the law requires. You agree to tell us promptly if you suspect an admin account or member account has been misused.
        </p>

        <h2>10. Fees</h2>
        <p>
          BandWagon is free for organizations and families. It is supported by optional donations and local sponsors. Giving is never required and never changes access, matching, or safety decisions.
          If we ever plan to charge organizations, we will give you advance notice and you can decide whether to continue. Nothing already free will be charged for without your agreement.
        </p>

        <h2>11. Suspension and termination</h2>
        <ul>
          <li>You may stop using BandWagon at any time and ask us to close your community.</li>
          <li>We may suspend or limit a community or account if needed to protect people, stop misuse, respond to a security issue, or follow the law. When we can, we will tell you first and work with you to fix the problem.</li>
          <li>We may end this agreement with at least 60 days&apos; notice if we stop offering BandWagon, except where safety or the law requires faster action.</li>
        </ul>

        <h2>12. Closing a community and deleting data</h2>
        <p>
          When a community is closed, BandWagon confirms the request, cancels open ride requests, turns off the community&apos;s web addresses, and schedules the community&apos;s data for deletion after a
          holding period (30 days by default). Members who also belong to other BandWagon communities keep their accounts, but data tied only to your community is removed. We may keep a small amount of
          information when the law requires it or when it is needed for security, safety, or to resolve a dispute. Encrypted backups expire on their normal schedule.
        </p>

        <h2>13. Disclaimers</h2>
        <p>
          BandWagon is provided &quot;as is&quot; and &quot;as available.&quot; To the extent the law allows, HWTech disclaims all warranties, including fitness for a particular purpose, and makes no promise that the
          service will be uninterrupted or error free, that any driver or ride is safe, or that any ride will be available. Drivers, passengers, and guardians are responsible for their own decisions,
          driving, supervision, vehicles, licenses, and insurance.
        </p>

        <h2>14. Limitation of liability</h2>
        <p>
          To the extent the law allows, HWTech is not liable for indirect, incidental, special, consequential, or punitive damages, or for injury, loss, or damage arising from any ride or from the conduct
          of any member, driver, or passenger. HWTech&apos;s total liability under this agreement is limited to one hundred U.S. dollars (US$100), because the service is provided free of charge.
          Nothing in this agreement limits liability that cannot be limited by law.
        </p>

        <h2>15. Governing law</h2>
        <p>
          Texas law governs this agreement, without regard to conflict of law rules. Any dispute will be brought in the state or federal courts located in Denton County, Texas, unless the law requires otherwise.
          Before filing a claim, each side agrees to try to resolve the dispute informally for at least 30 days.
        </p>

        <h2>16. Changes to this agreement</h2>
        <p>
          We may update this agreement as BandWagon changes. We will post the new version with a new version number and tell your admins about material changes at least 30 days before they take effect,
          unless a faster change is needed for safety, security, or legal reasons. If you do not agree to a change, you may close your community before it takes effect.
        </p>

        <h2>17. Contact</h2>
        <p>Questions about this agreement: <SupportContact />.</p>

        <div className="legal-links">
          <Link href="/legal">All Legal Documents</Link>
          <Link href="/terms">Terms of Use</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/legal/subprocessors">Subprocessors</Link>
          <Link href="/legal/student-data">Student Data</Link>
        </div>
      </article>
    </main>
  );
}
