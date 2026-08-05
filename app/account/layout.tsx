import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Account",
  description: "Log in to or create your Rap Market Index account.",
  path: "/account",
  noIndex: true
});

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
