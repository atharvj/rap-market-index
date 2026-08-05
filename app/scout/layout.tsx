import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Scout Emerging Artists",
  description: "Discover rising and underground rappers using current momentum, audience, and market signals.",
  path: "/scout"
});

export default function ScoutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
