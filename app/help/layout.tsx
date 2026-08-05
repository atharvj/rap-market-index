import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Help Center",
  description: "Get clear answers about RMI accounts, artist shares, quotes, portfolios, news, and trading limits.",
  path: "/help"
});

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return children;
}
