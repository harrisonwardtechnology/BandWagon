import { ImageResponse } from "next/og";
import { PRODUCT_TAGLINE } from "@/lib/json-ld";

// Share card for the product site (Open Graph and Twitter/X). Plain shapes and
// the built-in font only, so it renders without network access.
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT = `BandWagon: ${PRODUCT_TAGLINE}`;

const NAVY = "#071a33";
const GOLD = "#f5a800";

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
          <div style={{ width: 72, height: 72, borderRadius: 18, background: GOLD, display: "flex", alignItems: "center", justifyContent: "center", color: NAVY, fontSize: 48, fontWeight: 800 }}>B</div>
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
