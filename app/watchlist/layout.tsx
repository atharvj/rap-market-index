import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Watchlist",
  description: "Follow the artist quotes and signals you care about most.",
  path: "/watchlist",
  noIndex: true
});

export default function WatchlistLayout({ children }: { children: React.ReactNode }) {
  return children;
}
