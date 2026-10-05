"use client";

import { useEffect } from "react";
import { LifeBuoy, RotateCw, TriangleAlert } from "lucide-react";
import { reportBoundaryError } from "@/components/report-boundary-error";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportBoundaryError(error, "react-error-page"); }, [error]);
  return (
    <main className="state-shell">
      <section className="state-card" role="alert" aria-labelledby="error-heading">
        <div className="state-icon" aria-hidden="true"><TriangleAlert /></div>
        <h1 id="error-heading">Something Went Wrong</h1>
        <p>That’s on us, not you. Try again, and if it keeps happening, let us know so we can fix it.</p>
        <div className="state-actions">
          <button type="button" className="state-button" onClick={() => reset()}><RotateCw className="icon" aria-hidden="true" />Try Again</button>
          <a className="state-button quiet" href="/help"><LifeBuoy className="icon" aria-hidden="true" />Get Help</a>
        </div>
      </section>
    </main>
  );
}
