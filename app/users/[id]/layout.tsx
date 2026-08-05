import { createPageMetadata } from "@/lib/site-metadata";

type UserLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: UserLayoutProps) {
  const { id } = await params;

  return createPageMetadata({
    title: "Trader Profile",
    description: "View a public Rap Market Index fantasy portfolio profile.",
    path: `/users/${encodeURIComponent(id)}`,
    noIndex: true
  });
}

export default function UserLayout({ children }: UserLayoutProps) {
  return children;
}
