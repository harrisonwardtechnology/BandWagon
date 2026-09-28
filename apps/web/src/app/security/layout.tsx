import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata({
  title: "Security And Responsible Disclosure",
  description: "Report a security, privacy, or safety vulnerability in BandWagon. How we handle reports and what is in scope.",
  path: "/security",
});

export default function SecurityLayout({ children }: { children: React.ReactNode }) {
  return children;
}
