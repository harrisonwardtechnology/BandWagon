"use client";

import { useEffect } from "react";
import "./globals.css";
import { reportBoundaryError } from "@/components/report-boundary-error";

// Shown only when the page frame itself fails, so it carries its own <html> and
// keeps to plain markup with no other components.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportBoundaryError(error, "react-global-error"); }, [error]);
  return (
    <html lang="en">
      <body>
        <main className="state-shell" style={{ minHeight: "100vh" }}>
          <section className="state-card" role="alert" aria-labelledby="global-error-heading">
            <h1 id="global-error-heading">Something Went Wrong</h1>
            <p>BandWagon hit a snag loading this page. Try again in a moment.</p>
            <div className="state-actions">
              <button type="button" className="state-button" onClick={() => reset()}>Try Again</button>
              <a className="state-button quiet" href="/">Go Home</a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
