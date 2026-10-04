// Sends an error caught by a React error screen to /api/client-errors, which
// forwards it to GlitchTip when configured. Same rules as ClientErrorReporter:
// no user details, no query string, and it never throws.
export function reportBoundaryError(error: Error & { digest?: string }, kind: string) {
  try {
    const body = JSON.stringify({
      kind,
      name: error?.name || "Error",
      message: String(error?.message || "Unknown error").slice(0, 1000) + (error?.digest ? ` (digest ${error.digest})` : ""),
      stack: String(error?.stack || "").split("?")[0].slice(0, 6000),
      path: window.location.pathname,
    });
    fetch("/api/client-errors", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true, credentials: "omit" }).catch(() => {});
  } catch {
    // never let reporting throw
  }
}
