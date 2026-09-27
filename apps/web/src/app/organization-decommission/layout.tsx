import { privatePageMetadata } from "@/lib/seo";

// Token confirmation links. Never indexed.
export const metadata = privatePageMetadata("Confirm community closure");

export default function OrganizationDecommissionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
