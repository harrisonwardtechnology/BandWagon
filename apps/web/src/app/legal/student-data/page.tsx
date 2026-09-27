import type { Metadata } from "next";
import Link from "next/link";
import { LegalDraftBanner } from "@/components/legal-draft-banner";
import { publicPageMetadata } from "@/lib/seo";
import { SupportContact } from "@/components/support-contact";
import { PRIVACY_EMAIL_FALLBACK } from "@/lib/public-links";
import { STUDENT_DATA_STATEMENT_VERSION } from "@/lib/legal-versions";

export const metadata: Metadata = publicPageMetadata({
  title: "Student Data Statement (Draft)",
  description: "What BandWagon does and does not collect about students, and how guardians stay in control. For school and district reviewers.",
  path: "/legal/student-data",
});

export default function StudentDataPage() {
  return (
    <main className="shell legal-shell">
      <header className="legal-header">
        <Link className="brand-link" href="/">BandWagon</Link>
        <div className="eyebrow">For school and district reviewers</div>
        <h1>Student Data Statement</h1>
        <p>Version {STUDENT_DATA_STATEMENT_VERSION}</p>
      </header>

      <LegalDraftBanner />

      <section className="notice">
        <strong>In short:</strong> BandWagon is a parent-run carpool tool. It does not need school records, and parents control everything about their student. We never sell data or show ads.
      </section>

      <article className="legal-card">
        <h2>1. Who this is for</h2>
        <p>
          This statement is for school, district, and program staff who are asked about a BandWagon community used by families in their program. It explains how student information is handled.
          It is a plain-language summary. The <Link href="/privacy">Privacy Policy</Link> is the full policy.
        </p>

        <h2>2. The design choice: no school records needed</h2>
        <p>
          BandWagon is designed so a community can run without the school. Parents opt in and set up their own household. Adult volunteers offer rides. The school does not need to share a roster
          or take part in the ride arrangement. Because of this, BandWagon is designed to avoid needing school education records at all.
        </p>
        <p>
          We are not making a claim of formal certification under FERPA, COPPA, Texas education privacy laws, or any similar law. Whether a law applies depends on facts such as who sets up the community
          and what data is shared. We are happy to answer a reviewer&apos;s questions about how the design fits your requirements.
        </p>

        <h2>3. What BandWagon does not collect about students</h2>
        <ul>
          <li>No school roster, student ID number, or district account.</li>
          <li>No grades, attendance, discipline, IEP, 504, or health records.</li>
          <li>No full date of birth. Accounts use birth month and year only to tell adults from minors.</li>
          <li>No live GPS tracking and no background location collection.</li>
          <li>No photos of students, and no social profiles or public ratings.</li>
          <li>No advertising profiles and no ad trackers.</li>
        </ul>

        <h2>4. What BandWagon may hold about a student</h2>
        <p>Only what a parent or guardian chooses to enter so rides can be arranged:</p>
        <ul>
          <li>The student&apos;s name or display name, and which household and community they belong to.</li>
          <li>Birth month and year, or an age group, so minors get guardian protections.</li>
          <li>Which guardians may manage the student and approve rides.</li>
          <li>Ride requests for the student, such as the event, direction, and pickup or drop-off location.</li>
          <li>If the organization turns on student sign-in and a guardian sets it up, a student email used for sign-in codes.</li>
        </ul>

        <h2>5. Guardian control</h2>
        <ul>
          <li>A parent or guardian creates and manages any student profile. Students do not need their own account.</li>
          <li>Guardians can require their approval before a student requests a ride. Students default to needing approval.</li>
          <li>Student sign-in is off unless the organization turns it on, and a guardian must set it up and give consent. Turning it off or withdrawing consent ends the student&apos;s active sessions right away.</li>
          <li>Children under 13 cannot create their own account. A parent manages their profile.</li>
          <li>Guardians can review, correct, export, or delete their student&apos;s information.</li>
        </ul>

        <h2>6. Who can see student information</h2>
        <p>
          Only people with a reason to see it: the student&apos;s guardians, the community&apos;s admins within their role, and, for a confirmed ride, the matched driver. Other families see a general
          area instead of an exact address until a ride is confirmed. Exact addresses are encrypted, and each view of one is recorded.
        </p>

        <h2>7. No selling, no ads, no sponsor access</h2>
        <p>
          We never sell personal information, including student information. We do not use it for targeted advertising or to build profiles. Donors and sponsors get no participant data.
          Our service providers are listed on the <Link href="/legal/subprocessors">Subprocessors</Link> page and receive only what their job requires.
        </p>

        <h2>8. Retention and deletion</h2>
        <ul>
          <li>Exact pickup and drop-off locations for completed or cancelled rides are deleted after 30 days by default. The organization can set 1 to 365 days.</li>
          <li>When a guardian deletes an account, there is a seven-day safety grace period, then eligible personal information is removed.</li>
          <li>When a community is closed, data tied only to that community is deleted after a holding period (30 days by default).</li>
          <li>A small amount of restricted safety, consent, security, or audit information may be kept when needed for safety or the law.</li>
          <li>Encrypted backups expire on their normal schedule.</li>
        </ul>

        <h2>9. How to request access or deletion</h2>
        <p>
          A signed-in guardian can export data or schedule deletion from <Link href="/app/settings/privacy">Privacy &amp; Data</Link>. Anyone can also use the Privacy Request topic in the{" "}
          <Link href="/help">Help Center</Link>, email <a href={`mailto:${PRIVACY_EMAIL_FALLBACK}`}>{PRIVACY_EMAIL_FALLBACK}</a>, or contact <SupportContact />. We may confirm identity and
          guardian authority before acting. A school or district that believes a student&apos;s information was added without a guardian&apos;s permission can report it the same way, and we will act quickly.
        </p>

        <h2>10. Security</h2>
        <p>
          Data is encrypted in transit and at rest, and sensitive fields have extra encryption. Each community&apos;s data is kept separate. Access is limited by role and logged.
          Report a security concern through the <Link href="/security">Security</Link> page.
        </p>

        <div className="legal-links">
          <Link href="/legal">All Legal Documents</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/legal/subprocessors">Subprocessors</Link>
          <a href="/api/review-package">Organization Review Package</a>
        </div>
      </article>
    </main>
  );
}
