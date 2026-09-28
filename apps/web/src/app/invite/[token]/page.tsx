import type { Metadata } from "next";
import InviteAccept from "./invite-accept";

// Keep the one-time token out of Referer headers and search indexes.
export const metadata: Metadata = { title: "Accept Invitation", referrer: "no-referrer", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InviteAccept token={token} />;
}
