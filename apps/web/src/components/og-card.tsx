import { ImageResponse } from "next/og";
import { PRODUCT_TAGLINE } from "@/lib/json-ld";

// Share card for the product site (Open Graph and Twitter/X). Plain shapes and
// the built-in font only, so it renders without network access.
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT = `BandWagon: ${PRODUCT_TAGLINE}`;

const NAVY = "#071a33";
const GOLD = "#f5a800";
// Route-to-the-show mark (same art as /bandwagon-icon.svg), inlined so the card renders offline.
const MARK = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIiB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgcm9sZT0iaW1nIj48cmVjdCB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgcng9IjExMiIgZmlsbD0iIzA3MWEzMyIvPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDI1NiAyNTYpIHNjYWxlKDEuMCkgdHJhbnNsYXRlKC0yNDMuNSAtMjYyLjUpIj48cGF0aCBkPSJNMTI2IDQwMiBDIDEyNiAzMDAsIDM5NiAzMzQsIDM4OCAyMzIgQyAzODIgMTY0LCAyMzIgMTk2LCAyMjIgMjA0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iMjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWRhc2hhcnJheT0iMCA0MCIvPjxjaXJjbGUgY3g9IjEyNiIgY3k9IjQwMiIgcj0iMzgiIGZpbGw9IiNmNWE4MDAiLz48Y2lyY2xlIGN4PSIxMjYiIGN5PSI0MDIiIHI9IjE0IiBmaWxsPSIjMDcxYTMzIi8+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMjQ2IDIwMCkgc2NhbGUoMS4yKSIgZmlsbD0iI2Y1YTgwMCI+PHJlY3QgeD0iMTAiIHk9Ii05NiIgd2lkdGg9IjE2IiBoZWlnaHQ9Ijk2IiByeD0iNCIvPjxwYXRoIGQ9Ik0yNiAtOTYgQzYyIC04NCwgODQgLTY2LCA3NiAtMzAgQzcwIC01MCwgNTAgLTYwLCAyNiAtNjQgWiIvPjxlbGxpcHNlIGN4PSIwIiBjeT0iMCIgcng9IjMwIiByeT0iMjIiIHRyYW5zZm9ybT0icm90YXRlKC0yMCkiLz48L2c+PC9nPjwvc3ZnPg==";

export function renderOgCard() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: NAVY,
          color: "#ffffff",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", borderRadius: 20, border: `3px solid ${GOLD}`, overflow: "hidden" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MARK} width={72} height={72} alt="" />
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, color: GOLD, letterSpacing: 2 }}>BANDWAGON.CLUB</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 124, fontWeight: 800, letterSpacing: -3, lineHeight: 1 }}>
            <span>Band</span><span style={{ color: GOLD }}>Wagon</span>
          </div>
          <div style={{ marginTop: 28, fontSize: 46, lineHeight: 1.2, color: "#e2e8f0", maxWidth: 980 }}>{PRODUCT_TAGLINE}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 28, color: "#cbd5e1" }}>
          <div style={{ width: 120, height: 8, borderRadius: 4, background: GOLD }} />
          <span>Free for organizations and families. Privacy first.</span>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
