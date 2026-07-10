"use client";

import { ArtistAvatar } from "@/components/ArtistAvatar";
import { useGame } from "@/components/GameProvider";
import { ChangeText, RmiButton, RmiLineChart } from "@/components/RmiPrimitives";
import { WatchlistButton } from "@/components/WatchlistButton";
import { formatCurrency, formatShares } from "@/lib/formatters";
import Link from "next/link";
import { useMemo, useState } from "react";

export default function MarketsPage() {
  const { state, getHolding } = useGame();
  const [query, setQuery] = useState("");
  const artists = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return [...state.artists]
      .filter(
        (artist) =>
          !normalized ||
          artist.name.toLowerCase().includes(normalized) ||
          artist.ticker.toLowerCase().includes(normalized)
      )
      .sort((a, b) => Math.abs(b.dailyChangePercent) - Math.abs(a.dailyChangePercent));
  }, [query, state.artists]);

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">Markets</h1>
          <p className="mt-1 text-sm font-bold text-paper/70">{artists.length} artists listed</p>
        </div>
        <RmiButton href="/scout" variant="secondary">Scout artists</RmiButton>
      </header>

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm font-bold outline-none placeholder:text-paper/35 focus:border-cyan"
        placeholder="Search artist or ticker"
      />

      <section className="rmi-card overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1fr)_92px_70px_60px_32px] border-b border-line px-4 py-3 text-xs font-bold text-paper/45">
          <span>artist</span>
          <span className="text-right">price</span>
          <span className="text-right">24h</span>
          <span className="text-right">held</span>
          <span />
        </div>
        {artists.map((artist) => {
          const holding = getHolding(artist.id);

          return (
            <div
              key={artist.id}
              className="grid grid-cols-[minmax(0,1fr)_92px_70px_60px_32px] items-center border-b border-line px-4 py-3 last:border-b-0 hover:bg-panelSoft"
            >
              <Link href={`/artists/${artist.id}`} className="flex min-w-0 items-center gap-3">
                <ArtistAvatar artist={artist} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black">{artist.name}</span>
                  <span className="block truncate text-xs font-bold text-paper/45">${artist.ticker}</span>
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
        })}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {artists.slice(0, 4).map((artist) => (
          <Link key={artist.id} href={`/artists/${artist.id}`} className="rmi-card p-4 hover:border-cyan/70">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <ArtistAvatar artist={artist} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">{artist.name}</p>
                  <p className="text-xs font-bold text-paper/45">${artist.ticker} · {formatCurrency(artist.currentPrice)}</p>
                </div>
              </div>
              <ChangeText value={artist.dailyChangePercent} />
            </div>
            <div className="mt-4 h-16">
              <RmiLineChart data={artist.priceHistory} positive={artist.dailyChangePercent >= 0} height={72} />
            </div>
            <p className="mt-2 text-xs font-black text-paper/45">{artist.hypeScore}/100 RMI score</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
