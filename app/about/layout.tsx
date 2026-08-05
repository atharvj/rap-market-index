import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "About",
  description: "Learn how Rap Market Index turns verified artist momentum into a transparent fantasy market.",
  path: "/about"
});

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
