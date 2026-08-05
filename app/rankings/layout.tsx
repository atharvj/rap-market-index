import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Leaderboard",
  description: "See how public RMI fantasy portfolios rank by current market value.",
  path: "/leaderboard"
});

export default function RankingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
