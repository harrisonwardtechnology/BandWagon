/** Visible notice on every legal draft. Remove only after counsel signs off. */
export function LegalDraftBanner() {
  return (
    <section
      role="note"
      aria-label="Draft notice"
      style={{ margin: "0 0 18px", padding: "14px 18px", border: "2px solid #b45309", borderRadius: 14, background: "var(--bg-warn)", color: "var(--text-warn)", fontWeight: 800, fontFamily: "system-ui,sans-serif" }}
    >
      Draft for legal review. Not yet final.
    </section>
  );
}
