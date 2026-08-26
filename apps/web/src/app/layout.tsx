import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegister from "./PwaRegister";
import SupportModeBanner from "@/components/support-mode-banner";
import OfflineStatus from "./OfflineStatus";
import { BrandLogo } from "@/components/brand-logo";
import { PublicSiteHeader } from "@/components/public-site-header";

export const viewport: Viewport = {
  themeColor: "#071a33",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://bandwagon.harrisonward.net"),
  title: { default: "BandWagon", template: "%s | BandWagon" },
  description: "Privacy-first, open-source community ride coordination for families, teams, schools, and organizations.",
  applicationName: "BandWagon",
  icons: {
    icon: [{ url: "/bandwagon-icon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  alternates: { canonical: "/" },
  openGraph: {
    title: "BandWagon",
    description: "Privacy-first, open-source community ride coordination for families, teams, schools, and organizations.",
    url: "https://bandwagon.harrisonward.net",
    siteName: "BandWagon",
    images: [{ url: "/social/bandwagon-social.png", width: 1280, height: 640, alt: "BandWagon - Community-powered rides" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "BandWagon",
    description: "Privacy-first, open-source community ride coordination for families, teams, schools, and organizations.",
    images: ["/social/bandwagon-social.png"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const statusUrl=process.env.NEXT_PUBLIC_STATUS_URL||"https://status.harrisonward.org";
  const linkStyle={color:"#475569",textDecoration:"none",fontWeight:700,fontSize:13} as const;
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <PwaRegister />
        <OfflineStatus />
        <SupportModeBanner />
        <PublicSiteHeader />
        <div id="main-content" tabIndex={-1}>{children}</div>
        <footer style={{marginTop:48,borderTop:"1px solid #e2e8f0",background:"#f8fafc",padding:"24px 20px",fontFamily:"system-ui,sans-serif"}}>
          <div style={{maxWidth:1120,margin:"0 auto",display:"flex",gap:18,justifyContent:"space-between",alignItems:"center",flexWrap:"wrap"}}>
            <div className="footer-brand"><BrandLogo /><span>Community-powered rides</span></div>
            <nav aria-label="Footer" style={{display:"flex",gap:16,flexWrap:"wrap"}}>
              <a href="/help" style={linkStyle}>Help Center</a>
              <a href="/api/review-package" style={linkStyle}>Review Package</a>
              <a href={statusUrl} target="_blank" rel="noreferrer" style={linkStyle}>Platform Status <span className="sr-only">(opens in a new tab)</span></a>
              <a href="/security" style={linkStyle}>Security / Report a Bug</a>
              <a href="/support" style={linkStyle}>Support BandWagon</a>
              <a href="/privacy" style={linkStyle}>Privacy</a>
              <a href="/terms" style={linkStyle}>Terms</a>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
