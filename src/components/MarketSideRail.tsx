"use client";

import { ArtistAvatar } from "@/components/ArtistAvatar";
import { useGame } from "@/components/GameProvider";
import { MiniSparkline } from "@/components/MiniSparkline";
import { RmiSection } from "@/components/RmiPrimitives";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import type { Artist } from "@/lib/types";
import Link from "next/link";
import { useMemo } from "react";

export function MarketSideRail({
  currentArtistId,
  includeWatchlist = true,
  listSize = 5
}: {
  currentArtistId?: string;
  includeWatchlist?: boolean;
  listSize?: number;
}) {
  const { state, watchlistArtists } = useGame();
  const marketLists = useMemo(() => {
    const available = state.artists.filter((artist) => artist.id !== currentArtistId);
    const gainers = available
      .filter((artist) => artist.dailyChangePercent > 0)
      .sort((first, second) => second.dailyChangePercent - first.dailyChangePercent)
      .slice(0, listSize);
    const losers = available
      .filter((artist) => artist.dailyChangePercent < 0)
      .sort((first, second) => first.dailyChangePercent - second.dailyChangePercent)
      .slice(0, listSize);
    const movers = [...available]
      .sort((first, second) => second.hypeScore - first.hypeScore || Math.abs(second.dailyChangePercent) - Math.abs(first.dailyChangePercent))
      .slice(0, listSize);

    return { gainers, losers, movers };
  }, [currentArtistId, listSize, state.artists]);

  return (
    <div className="space-y-4">
      <MarketList title="Trending Tickers" artists={marketLists.movers} href="/markets" />
      {includeWatchlist && watchlistArtists.length ? (
        <MarketList title="Your Watchlist" artists={watchlistArtists.slice(0, listSize)} href="/watchlist" />
      ) : null}
      <MarketList title="Top Gainers" artists={marketLists.gainers} href="/markets" />
      <MarketList title="Top Losers" artists={marketLists.losers} href="/markets" />
    </div>
  );
}

function MarketList({
  title,
  artists,
  href
}: {
  title: string;
  artists: Artist[];
  href?: string;
}) {
  if (!artists.length) {
    return null;
  }

  return (
    <RmiSection
      title={title}
      action={href ? <Link href={href} className="text-xs font-bold text-cyan hover:underline">View All</Link> : null}
    >
      <div className="divide-y divide-line">
        {artists.map((artist) => (
          <Link
            key={artist.id}
            href={`/artists/${artist.id}`}
            className="grid grid-cols-[minmax(0,1fr)_64px_68px] items-center gap-2 px-3 py-2.5 transition hover:bg-panelSoft"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <ArtistAvatar artist={artist} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-xs font-black">{artist.name}</span>
                <span className="block truncate text-[10px] font-bold text-paper/42">${artist.ticker}</span>
              </span>
            </span>
            <MiniSparkline
              data={artist.priceHistory}
              positive={artist.dailyChangePercent >= 0}
              width={64}
              height={24}
            />
            <span className="text-right number-tabular">
              <span className="block text-xs font-black">{formatCurrency(artist.currentPrice)}</span>
              <span className={artist.dailyChangePercent >= 0 ? "block text-[10px] font-black text-mint" : "block text-[10px] font-black text-ember"}>
                {formatPercent(artist.dailyChangePercent)}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </RmiSection>
  );
}
