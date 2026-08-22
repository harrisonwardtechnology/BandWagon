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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><PwaRegister />{children}</body></html>;
}
