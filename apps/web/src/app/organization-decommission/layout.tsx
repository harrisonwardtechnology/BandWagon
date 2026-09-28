import { privatePageMetadata } from "@/lib/seo";

// Token confirmation links. Never indexed.
export const metadata = privatePageMetadata("Confirm Community Closure");

export default function OrganizationDecommissionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
