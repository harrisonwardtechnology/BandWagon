import { privatePageMetadata } from "@/lib/seo";

// Signed-in family and driver area. Never indexed.
export const metadata = privatePageMetadata("My rides");

export default function MemberAppLayout({ children }: { children: React.ReactNode }) {
  return children;
}
