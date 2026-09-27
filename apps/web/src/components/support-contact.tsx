import { SUPPORT_EMAIL_FALLBACK, helpDeskUrl } from "@/lib/public-links";

/**
 * The support contact shown on public pages. Uses the help desk portal from
 * NEXT_PUBLIC_HELP_DESK_URL when it is set, and always keeps email as a fallback.
 */
export function SupportContact({ email = SUPPORT_EMAIL_FALLBACK, label = "BandWagon Support" }: { email?: string; label?: string }) {
  const desk = helpDeskUrl();
  if (!desk) {
    return <a href={`mailto:${email}`}>{email}</a>;
  }
  return (
    <>
      <a href={desk} target="_blank" rel="noreferrer">{label} help desk<span className="sr-only"> (opens in a new tab)</span></a>
      {" "}or email <a href={`mailto:${email}`}>{email}</a>
    </>
  );
}
