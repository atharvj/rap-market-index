import { getInitialArtistIdentities } from "@/data/mockArtists";
import { createPageMetadata } from "@/lib/site-metadata";

type ArtistLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: ArtistLayoutProps) {
  const { id } = await params;
  const identity = getInitialArtistIdentities().find((artist) => artist.id === id);
  const artistName = identity?.name ?? formatArtistSlug(id);
  const ticker = identity?.ticker ? ` ($${identity.ticker})` : "";

  return createPageMetadata({
    title: `${artistName}${ticker}`,
    description: `Track ${artistName}'s RMI fantasy quote, price history, signal breakdown, market news, and related artists.`,
    path: `/artists/${encodeURIComponent(id)}`
  });
}

export default function ArtistLayout({ children }: ArtistLayoutProps) {
  return children;
}

function formatArtistSlug(value: string) {
  return decodeURIComponent(value)
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
