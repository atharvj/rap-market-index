"use client";

import { ArtistAvatar } from "@/components/ArtistAvatar";
import { useGame } from "@/components/GameProvider";
import { ChangeText, RmiButton } from "@/components/RmiPrimitives";
import { WatchlistButton } from "@/components/WatchlistButton";
import { formatCurrency, formatShares } from "@/lib/formatters";
import Link from "next/link";

export default function WatchlistPage() {
  const { watchlistArtists, getHolding } = useGame();

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
        <div className="grid grid-cols-[minmax(0,1fr)_92px_70px_70px_32px] border-b border-line px-4 py-3 text-xs font-bold text-paper/45">
          <span>artist</span>
          <span className="text-right">price</span>
          <span className="text-right">24h</span>
          <span className="text-right">held</span>
          <span />
        </div>
        {watchlistArtists.length ? (
          watchlistArtists.map((artist) => {
            const holding = getHolding(artist.id);

            return (
              <div
                key={artist.id}
                className="grid grid-cols-[minmax(0,1fr)_92px_70px_70px_32px] items-center border-b border-line px-4 py-3 last:border-b-0 hover:bg-panelSoft"
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
                <span className="text-right text-sm font-black number-tabular">
                  {holding ? `${formatShares(holding.shares)} sh` : "-"}
                </span>
                <WatchlistButton artistId={artist.id} />
              </div>
            );
          })
        ) : (
          <div className="p-6 text-sm font-bold text-paper/60">No artists saved yet. Add listings from Markets.</div>
        )}
      </section>
    </div>
  );
}
