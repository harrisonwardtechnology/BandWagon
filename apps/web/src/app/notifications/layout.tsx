import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata("Notifications");

export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
