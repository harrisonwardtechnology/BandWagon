import { privatePageMetadata } from "@/lib/seo";

// Organization and platform administration. Never indexed.
export const metadata = privatePageMetadata("Admin");

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
