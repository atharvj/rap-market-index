import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Terms of Use",
  description: "Review the terms for using the Rap Market Index fantasy market and community features.",
  path: "/terms"
});

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
