import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegister from "./PwaRegister";
import SupportModeBanner from "@/components/support-mode-banner";
import OfflineStatus from "./OfflineStatus";
import { BrandLogo } from "@/components/brand-logo";
import { PublicSiteHeader } from "@/components/public-site-header";
import PrivacyConsentManager, { PrivacyPreferencesButton } from "@/components/privacy-consent-manager";
import { StagingBanner } from "@/components/staging-banner";
import { isStagingEnvironment } from "@/lib/public-links";
import { NOINDEX, OG_IMAGE, siteOrigin, TWITTER_IMAGE } from "@/lib/seo";
import ClientErrorReporter from "@/components/client-error-reporter";

export const viewport: Viewport = {
  themeColor: "#071a33",
  width: "device-width",
  initialScale: 1,
};

const siteDescription =
  "Free, privacy-first carpool coordination for school bands, teams, clubs, troops, and other trusted groups. Families share rides to rehearsals, games, and events. No fees, no ads, no live tracking.";

// Defaults for every page. Public pages set their own title, description, and
// canonical (see src/lib/seo.ts). There is deliberately no site-wide canonical,
// or every page would point at the home page. Community (tenant) hosts and
// signed-in areas are kept out of search by page metadata, robots.ts, and the
// X-Robots-Tag header set in middleware.
export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: { default: "BandWagon: Free community carpools for schools, bands, and teams", template: "%s | BandWagon" },
  description: siteDescription,
  applicationName: "BandWagon",
  keywords: [
    "carpool app",
    "school carpool",
    "band carpool",
    "marching band rides",
    "team carpool",
    "youth sports carpool",
    "ride coordination",
    "community carpool",
    "parent carpool organizer",
    "free carpool app",
  ],
  authors: [{ name: "Harrison Ward Technology" }],
  creator: "Harrison Ward Technology",
  publisher: "Harrison Ward Technology",
  category: "lifestyle",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/bandwagon-icon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }, { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "BandWagon", statusBarStyle: "default" },
  formatDetection: { telephone: false, email: false, address: false },
  openGraph: {
    title: "BandWagon: Free community carpools for schools, bands, and teams",
    description: siteDescription,
    url: "/",
    siteName: "BandWagon",
    locale: "en_US",
    type: "website",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "BandWagon: Free community carpools for schools, bands, and teams",
    description: siteDescription,
    images: [TWITTER_IMAGE],
  },
  robots: isStagingEnvironment() ? NOINDEX : { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const linkStyle={color:"#475569",textDecoration:"none",fontWeight:700,fontSize:13} as const;
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip To Main Content</a>
        <StagingBanner />
        <PrivacyConsentManager />
        <PwaRegister />
        <ClientErrorReporter />
        <OfflineStatus />
        <SupportModeBanner />
        <PublicSiteHeader />
        <div id="main-content" tabIndex={-1}>{children}</div>
        <footer style={{marginTop:48,borderTop:"1px solid #e2e8f0",background:"#f8fafc",padding:"24px 20px",fontFamily:"system-ui,sans-serif"}}>
          <div style={{maxWidth:1120,margin:"0 auto",display:"flex",gap:18,justifyContent:"space-between",alignItems:"center",flexWrap:"wrap"}}>
            <div className="footer-brand"><BrandLogo /><span>Community-Powered Rides</span></div>
            <nav aria-label="Footer" style={{display:"flex",gap:16,flexWrap:"wrap"}}>
              <a href="/help" style={linkStyle}>Help Center</a>
              <a href="/api/review-package" style={linkStyle}>Review Package</a>
              <a href="/status" style={linkStyle}>Platform Status</a>
              <a href="https://status.bandwagon.club/" target="_blank" rel="noreferrer" style={linkStyle}>Status Page</a>
              <a href="/security" style={linkStyle}>Security / Report A Bug</a>
              <a href="/support" style={linkStyle}>Support BandWagon</a>
              <a href="/privacy" style={linkStyle}>Privacy</a>
              <a href="/cookies" style={linkStyle}>Cookies</a>
              <PrivacyPreferencesButton />
              <a href="/terms" style={linkStyle}>Terms</a>
              <a href="/legal" style={linkStyle}>Legal</a>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
