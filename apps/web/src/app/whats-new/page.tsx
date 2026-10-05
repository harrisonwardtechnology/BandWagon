import Link from "next/link";
import { Sparkles } from "lucide-react";
import { publicPageMetadata } from "@/lib/seo";
import { whatsNewEntries } from "@/lib/whats-new";

export const metadata = publicPageMetadata({
  title: "What's New",
  description: "The latest BandWagon updates in plain words: new features, fixes and improvements for families, drivers and community organizers.",
  path: "/whats-new",
});

export default function WhatsNewPage() {
  const entries = whatsNewEntries();
  return (
    <main className="shell legal-shell">
      <header className="legal-header">
        <div className="eyebrow">Updates</div>
        <h1>What’s New</h1>
        <p>New features and fixes, newest first.</p>
      </header>
      {entries.map((entry, index) => (
        <article key={entry.date} className="legal-card" style={{ marginBottom: 16 }} aria-labelledby={`whats-new-${entry.date}`}>
          <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <time dateTime={entry.date}>{entry.displayDate}</time>
            {index === 0 && <span className="whats-new-latest"><Sparkles className="icon" aria-hidden="true" /> Latest</span>}
          </div>
          <h2 id={`whats-new-${entry.date}`} style={{ marginTop: 8 }}>{entry.title}</h2>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {entry.items.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </article>
      ))}
      <p className="fine-print" style={{ textAlign: "center" }}>
        Have an idea? <Link href="/help/ideas">Suggest A Feature</Link>
      </p>
    </main>
  );
}
