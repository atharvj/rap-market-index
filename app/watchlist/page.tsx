"use client";

import { ArtistAvatar } from "@/components/ArtistAvatar";
import { useGame } from "@/components/GameProvider";
import { ChangeText, RmiButton } from "@/components/RmiPrimitives";
import { WatchlistButton } from "@/components/WatchlistButton";
import { formatCurrency } from "@/lib/formatters";
import Link from "next/link";

export default function WatchlistPage() {
  const { watchlistArtists } = useGame();

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">Watchlist</h1>
          <p className="mt-1 text-sm font-bold text-paper/70">{watchlistArtists.length} artists you're tracking</p>
        </div>
        <RmiButton href="/markets" variant="secondary">+ Add artist</RmiButton>
      </header>

      <section className="rmi-card overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1fr)_96px_76px_40px] gap-x-3 border-b border-line px-4 py-3 text-xs font-bold text-paper/45">
          <span>artist</span>
          <span className="text-right">price</span>
          <span className="text-right">24h</span>
          <span className="sr-only">remove from watchlist</span>
        </div>
        {watchlistArtists.length ? (
          watchlistArtists.map((artist) => (
            <div
              key={artist.id}
              className="grid grid-cols-[minmax(0,1fr)_96px_76px_40px] items-center gap-x-3 border-b border-line px-4 py-3 last:border-b-0 hover:bg-panelSoft"
            >
              <Link href={`/artists/${artist.id}`} className="flex min-w-0 items-center gap-3">
                <ArtistAvatar artist={artist} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black">{artist.name}</span>
                  <span className="text-xs font-bold text-paper/45">${artist.ticker}</span>
                </span>
              </Link>
              <span className="text-right text-sm font-black number-tabular">{formatCurrency(artist.currentPrice)}</span>
              <span className="text-right text-xs">
                <ChangeText value={artist.dailyChangePercent} />
              </span>
              <WatchlistButton artistId={artist.id} />
            </div>
          ))
        ) : (
          <div className="p-6 text-sm font-bold text-paper/60">No artists saved yet. Add listings from Markets.</div>
        )}
      </section>
    </div>
  );
}
