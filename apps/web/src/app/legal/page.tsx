import type { Metadata } from "next";
import Link from "next/link";
import { LegalDraftBanner } from "@/components/legal-draft-banner";
import { ORGANIZATION_AGREEMENT_VERSION, STUDENT_DATA_STATEMENT_VERSION, SUBPROCESSOR_LIST_VERSION } from "@/lib/legal-versions";

export const metadata: Metadata = {
  title: "Legal",
  description: "BandWagon legal documents: terms, privacy, organization agreement, subprocessors, and student data statement.",
  alternates: { canonical: "/legal" },
};

const current = [
  ["/terms", "Terms of Use", "Rules for everyone who uses BandWagon."],
  ["/privacy", "Privacy Policy", "What we collect, why, who we share it with, and your rights."],
  ["/cookies", "Cookie Policy", "The small amount of browser storage BandWagon uses."],
  ["/messaging", "Messaging and SMS Consent", "How text messages work, and how to stop them."],
] as const;

const drafts = [
  ["/legal/organization-agreement", "Organization Agreement", `What an organization leader agrees to when requesting a community. Version ${ORGANIZATION_AGREEMENT_VERSION}.`],
  ["/legal/subprocessors", "Subprocessors", `The outside services that help run BandWagon, what they receive, and when. Version ${SUBPROCESSOR_LIST_VERSION}.`],
  ["/legal/student-data", "Student Data Statement", `A plain statement for school and district reviewers. Version ${STUDENT_DATA_STATEMENT_VERSION}.`],
] as const;

export default function LegalIndexPage() {
  return (
    <main className="shell legal-shell">
      <header className="legal-header">
        <Link className="brand-link" href="/">BandWagon</Link>
        <div className="eyebrow">A Harrison Ward Technology product</div>
        <h1>Legal</h1>
        <p>Every BandWagon policy and agreement in one place.</p>
      </header>

      <LegalDraftBanner />

      <article className="legal-card">
        <h2>Current policies</h2>
        <ul>
          {current.map(([href, title, body]) => (
            <li key={href}><Link href={href}><strong>{title}</strong></Link>. {body}</li>
          ))}
        </ul>

        <h2>Drafts under legal review</h2>
        <p>These documents are drafts. They describe how BandWagon works today, but a lawyer has not finished reviewing them. They may change before they are final.</p>
        <ul>
          {drafts.map(([href, title, body]) => (
            <li key={href}><Link href={href}><strong>{title}</strong></Link>. {body}</li>
          ))}
        </ul>

        <h2>Who we are</h2>
        <p>BandWagon is operated by Harrison Ward Technology, LLC, Flower Mound, Texas, United States.</p>

        <div className="legal-links">
          <Link href="/help">Help Center</Link>
          <Link href="/security">Security</Link>
          <Link href="/status">Platform Status</Link>
          <Link href="/">BandWagon Home</Link>
        </div>
      </article>
    </main>
  );
}
