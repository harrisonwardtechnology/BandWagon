// What's New entries, newest first. Plain words for families and organizers,
// not release notes for developers (those live in CHANGELOG.md).
// Add an entry in every pull request that changes what people see or do.
// No "@/" imports so node --test can load this file directly.

export type WhatsNewEntry = {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  title: string;
  items: string[];
};

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    date: "2026-10-04",
    title: "A Fresh Look, Day Or Night",
    items: [
      "Dark mode. BandWagon now follows the light or dark setting on your phone or computer.",
      "New menu icons, and bigger buttons that are easier to tap.",
      "On a phone, the menu is a tidy grid instead of a long list.",
      "Friendlier pages when a link is old or something goes wrong.",
      "This What's New page, so you can see what changed.",
    ],
  },
  {
    date: "2026-09-29",
    title: "Passkeys, Waitlists And A New Logo",
    items: [
      "Sign in with a passkey: your face, fingerprint or screen lock instead of a code.",
      "Seat waitlists. If a carpool is full, get in line and we'll offer you the seat when one opens.",
      "Suggest an event. Members can propose events for an organizer to approve, when the community turns this on.",
      "Trusted adults. Guardians can let another adult, like a grandparent, help with rides for a set time.",
      "Share an idea. Suggest a feature and vote on other ideas in the Help Center.",
      "Clearer text message sign-up, with one welcome text and easy STOP and HELP replies.",
      "A new logo, Route To The Show, and a new home at bandwagon.club.",
    ],
  },
];

/** Entries sorted newest first, with a display date like "October 4, 2026". */
export function whatsNewEntries(entries: WhatsNewEntry[] = WHATS_NEW) {
  return [...entries]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((entry) => ({
      ...entry,
      displayDate: new Date(`${entry.date}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }),
    }));
}
