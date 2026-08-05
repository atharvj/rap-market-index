import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Finish Setup",
  description: "Complete your Rap Market Index account setup.",
  path: "/onboarding",
  noIndex: true
});

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
