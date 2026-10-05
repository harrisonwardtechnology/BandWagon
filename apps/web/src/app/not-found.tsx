import Link from "next/link";
import { House, LifeBuoy, MapPinOff } from "lucide-react";
import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata("Page Not Found");

export default function NotFound() {
  return (
    <main className="state-shell">
      <section className="state-card" aria-labelledby="not-found-heading">
        <div className="state-route" aria-hidden="true"><span /><i /><MapPinOff className="icon" /></div>
        <div className="eyebrow">404</div>
        <h1 id="not-found-heading">We Couldn’t Find That Page</h1>
        <p>The link may be old, or the page may have moved. Let’s get you back on the road.</p>
        <div className="state-actions">
          <Link className="state-button" href="/"><House className="icon" aria-hidden="true" />Go Home</Link>
          <Link className="state-button quiet" href="/help"><LifeBuoy className="icon" aria-hidden="true" />Get Help</Link>
        </div>
      </section>
    </main>
  );
}
