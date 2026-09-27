import { privatePageMetadata } from "@/lib/seo";

// Donation checkout. Linked from public pages but kept out of search results.
export const metadata = privatePageMetadata("Support BandWagon");

export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
