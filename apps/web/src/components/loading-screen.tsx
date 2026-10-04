// Friendly loading state for signed-in areas. Kept out of the public pages on
// purpose: a root-level loading screen makes Next.js stream public pages, and a
// streamed page can no longer answer with a real 404 status.
export function LoadingScreen({ label = "Loading…" }: { label?: string }) {
  return (
    <main className="state-shell" aria-busy="true">
      <div role="status" style={{ textAlign: "center" }}>
        <div className="loading-dots" aria-hidden="true"><span /><span /><span /></div>
        <p style={{ margin: "14px 0 0", color: "var(--text-muted)", fontWeight: 700 }}>{label}</p>
      </div>
    </main>
  );
}
