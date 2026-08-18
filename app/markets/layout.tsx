import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Artist Markets",
  description: "Compare current fantasy quotes, daily moves, and RMI Momentum across the rapper market.",
  path: "/markets"
});

export default function MarketsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
