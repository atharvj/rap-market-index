"use client";

import { ArtistAvatar } from "@/components/ArtistAvatar";
import { useGame } from "@/components/GameProvider";
import { MiniSparkline } from "@/components/MiniSparkline";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import type { Artist } from "@/lib/types";
import { Activity, Flame, Star, TrendingDown, TrendingUp } from "lucide-react";
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
    <aside className="rmi-card overflow-hidden">
      <MarketList title="Trending Tickers" artists={marketLists.movers} href="/markets" tone="cyan" icon="activity" />
      {includeWatchlist && watchlistArtists.length ? (
        <MarketList title="Your Watchlist" artists={watchlistArtists.slice(0, listSize)} href="/watchlist" tone="violet" icon="star" />
      ) : null}
      <MarketList title="Top Gainers" artists={marketLists.gainers} href="/markets" tone="mint" icon="up" />
      <MarketList title="Top Losers" artists={marketLists.losers} href="/markets" tone="ember" icon="down" />
    </aside>
  );
}

function MarketList({
  title,
  artists,
  href,
  tone,
  icon
}: {
  title: string;
  artists: Artist[];
  href?: string;
  tone: "cyan" | "mint" | "ember" | "violet";
  icon: "activity" | "up" | "down" | "star";
}) {
  if (!artists.length) {
    return null;
  }

  const toneClasses = {
    cyan: "text-cyan",
    mint: "text-mint",
    ember: "text-ember",
    violet: "text-violet"
  }[tone];

  return (
    <section className="border-t border-line/75 first:border-t-0">
      <div className="rmi-section-header flex items-center justify-between gap-3 px-3 py-2.5">
        <span className="flex items-center gap-2">
          <RailIcon icon={icon} className={`h-3.5 w-3.5 ${toneClasses}`} />
          <span className="text-xs font-black">{title}</span>
        </span>
        {href ? <Link href={href} className="text-[11px] font-bold text-cyan hover:text-paper">View All</Link> : null}
      </div>
      <div className="divide-y divide-line/75">
        {artists.map((artist) => (
          <Link
            key={artist.id}
            href={`/artists/${artist.id}`}
            className="group grid grid-cols-[minmax(0,1fr)_64px_68px] items-center gap-2 px-3 py-2.5 transition hover:bg-cyan/[0.045]"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <ArtistAvatar artist={artist} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-xs font-black transition group-hover:text-cyan">{artist.name}</span>
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
    </section>
  );
}

function RailIcon({ icon, className }: { icon: "activity" | "up" | "down" | "star"; className: string }) {
  if (icon === "up") return <TrendingUp className={className} aria-hidden="true" />;
  if (icon === "down") return <TrendingDown className={className} aria-hidden="true" />;
  if (icon === "star") return <Star className={className} aria-hidden="true" />;
  if (icon === "activity") return <Flame className={className} aria-hidden="true" />;
  return <Activity className={className} aria-hidden="true" />;
}
