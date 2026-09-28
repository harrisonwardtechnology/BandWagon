import { privatePageMetadata } from "@/lib/seo";

// Sign-in links can carry one-time tokens. Never indexed.
export const metadata = privatePageMetadata("Sign In");

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
