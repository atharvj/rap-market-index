import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Market News",
  description: "Follow verified music releases, interviews, and artist catalysts ranked by their market relevance.",
  path: "/news"
});

export default function NewsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
