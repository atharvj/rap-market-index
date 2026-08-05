import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Operations",
  description: "Rap Market Index operations tools.",
  path: "/dev",
  noIndex: true
});

export default function DevLayout({ children }: { children: React.ReactNode }) {
  return children;
}
