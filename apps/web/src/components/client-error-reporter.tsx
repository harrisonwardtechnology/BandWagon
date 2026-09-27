"use client";

import { useEffect } from "react";

// Sends uncaught browser errors to /api/client-errors, which forwards them to
// GlitchTip when it is configured. No third-party script, no cookies read,
// no user details. Query strings are dropped before sending, and each page
// load sends at most 5 reports.
const MAX_REPORTS = 5;

export default function ClientErrorReporter() {
  useEffect(() => {
    let sent = 0;
    const seen = new Set<string>();

    function send(kind: string, error: unknown, fallbackMessage?: string) {
      if (sent >= MAX_REPORTS) return;
      const err = error instanceof Error ? error : null;
      const message = String(err?.message || fallbackMessage || (typeof error === "string" ? error : "Unknown browser error")).slice(0, 1000);
      // Browser extensions and cross-origin scripts produce noise we can't act on.
      if (!message || message === "Script error." || /extension:\/\//.test(err?.stack || "")) return;
      const key = `${kind}|${message}`;
      if (seen.has(key)) return;
      seen.add(key);
      sent++;
      const body = JSON.stringify({
        kind,
        name: err?.name || "Error",
        message,
        stack: (err?.stack || "").split("?")[0].slice(0, 6000),
        path: window.location.pathname,
      });
      try {
        fetch("/api/client-errors", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true, credentials: "omit" }).catch(() => {});
      } catch {
        // never let reporting throw
      }
    }

    const onError = (event: ErrorEvent) => send("error", event.error, event.message);
    const onRejection = (event: PromiseRejectionEvent) => send("unhandledrejection", event.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
