import { privatePageMetadata } from "@/lib/seo";

// Sign-in links can carry one-time tokens. Never indexed.
export const metadata = privatePageMetadata("Sign in");

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
