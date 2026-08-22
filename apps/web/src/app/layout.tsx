import type { Metadata, Viewport } from "next";
import "./globals.css";
import { platformBrand } from "@/lib/branding";
import PwaRegister from "./PwaRegister";

export const metadata: Metadata = {
  title: `${platformBrand.name} | ${platformBrand.tagline}`,
  description: "Privacy-first, open-source community carpool coordination platform.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "BandWagon", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" }
};

export const viewport: Viewport = { themeColor: "#101b33", width: "device-width", initialScale: 1 };

export const metadata = {
  metadataBase: new URL("https://bandwagon.harrisonward.net"),
  title: {
    default: "BandWagon",
    template: "%s | BandWagon",
  },
  description:
    "Privacy-first, open-source community ride coordination for families, teams, schools, and organizations.",
  applicationName: "BandWagon",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "BandWagon",
    description:
      "Privacy-first, open-source community ride coordination for families, teams, schools, and organizations.",
    url: "https://bandwagon.harrisonward.net",
    siteName: "BandWagon",
    images: [
      {
        url: "/social/bandwagon-social.png",
        width: 1280,
        height: 640,
        alt: "BandWagon - Community-powered rides",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "BandWagon",
    description:
      "Privacy-first, open-source community ride coordination for families, teams, schools, and organizations.",
    images: ["/social/bandwagon-social.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><PwaRegister />{children}</body></html>;
}
