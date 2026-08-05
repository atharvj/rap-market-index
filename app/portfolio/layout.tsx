import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Portfolio",
  description: "Review your RMI fantasy cash, holdings, cost basis, and unrealized performance.",
  path: "/portfolio",
  noIndex: true
});

export default function PortfolioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
