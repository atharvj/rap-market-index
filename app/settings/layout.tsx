import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Settings",
  description: "Manage your Rap Market Index profile, privacy, appearance, and account settings.",
  path: "/settings",
  noIndex: true
});

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
