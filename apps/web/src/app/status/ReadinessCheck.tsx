"use client";

import { useCallback, useEffect, useState } from "react";

type State = "checking" | "up" | "down";

const labels: Record<State, { text: string; color: string; background: string }> = {
  checking: { text: "Checking...", color: "#334155", background: "#f1f5f9" },
  up: { text: "Up. BandWagon is responding normally.", color: "#14532d", background: "#dcfce7" },
  down: { text: "Down. BandWagon is not responding right now.", color: "#7f1d1d", background: "#fee2e2" },
};

/** Calls the public readiness endpoint from the browser and shows only up or down. */
export default function ReadinessCheck() {
  const [state, setState] = useState<State>("checking");
  const [checkedAt, setCheckedAt] = useState<string>("");

  const check = useCallback(async () => {
    setState("checking");
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const response = await fetch("/api/health/ready", { cache: "no-store", signal: controller.signal });
      clearTimeout(timer);
      setState(response.ok ? "up" : "down");
    } catch {
      setState("down");
    }
    setCheckedAt(new Date().toLocaleTimeString());
  }, []);

  useEffect(() => {
    void check();
    const interval = setInterval(() => void check(), 60_000);
    return () => clearInterval(interval);
  }, [check]);

  const label = labels[state];
  return (
    <div>
      <p role="status" aria-live="polite" style={{ margin: 0, padding: "16px 18px", borderRadius: 14, fontSize: 18, fontWeight: 850, color: label.color, background: label.background }}>
        {label.text}
      </p>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
        <button type="button" onClick={() => void check()} disabled={state === "checking"} style={{ padding: "10px 14px", border: "1px solid #cbd5e1", borderRadius: 10, background: "#fff", fontWeight: 800, cursor: "pointer" }}>
          Check again
        </button>
        {checkedAt && <span style={{ color: "#64748b", fontSize: 14 }}>Last checked {checkedAt}. Rechecks every minute.</span>}
      </div>
    </div>
  );
}
