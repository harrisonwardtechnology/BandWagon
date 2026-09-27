import type { Metadata } from "next";
import HouseholdInviteAccept from "./household-invite-accept";

// Keep the one-time token out of Referer headers and search indexes.
export const metadata: Metadata = { title: "Trusted adult invitation", referrer: "no-referrer", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function HouseholdInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <HouseholdInviteAccept token={token} />;
}
