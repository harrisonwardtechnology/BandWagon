import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata({
  title: "Start a free community",
  description: "Request a free BandWagon community for your band, team, club, troop, or school group. Set your own driver rules and invite your families.",
  path: "/start",
});

export default function StartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
