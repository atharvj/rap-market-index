import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Leagues",
  description: "Create or join RMI leagues and compete with friends using fantasy artist portfolios.",
  path: "/leagues"
});

export default function LeaguesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
