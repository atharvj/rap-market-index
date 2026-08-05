import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Privacy Policy",
  description: "Read how Rap Market Index handles account, profile, analytics, and support information.",
  path: "/privacy"
});

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
