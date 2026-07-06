"use client";

import { ArtistAvatar } from "@/components/ArtistAvatar";
import { useGame } from "@/components/GameProvider";
import { MarketNewsFeed } from "@/components/MarketNewsFeed";
import { MiniSparkline } from "@/components/MiniSparkline";
import { ScoreInfo } from "@/components/ScoreInfo";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import type { Artist } from "@/lib/types";
import { Newspaper, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

export default function NewsPage() {
  const { state } = useGame();
  const topGainers = useMemo(
    () => [...state.artists].sort((a, b) => b.dailyChangePercent - a.dailyChangePercent).slice(0, 8),
    [state.artists]
  );
  const topLosers = useMemo(
    () => [...state.artists].sort((a, b) => a.dailyChangePercent - b.dailyChangePercent).slice(0, 8),
    [state.artists]
  );
  const mostActive = useMemo(
    () => [...state.artists].sort((a, b) => b.hypeScore - a.hypeScore).slice(0, 8),
    [state.artists]
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">
        <section className="bg-panel shadow-market md:rounded md:border md:border-line">
          <div className="border-b border-line p-5">
            <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wide text-brass">
              <Newspaper className="h-5 w-5" aria-hidden="true" />
              RMI News
            </p>
            <h1 className="mt-4 text-2xl font-black leading-tight sm:text-3xl">
              News from the Rap Market Index network
            </h1>
            <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-paper/60">
              Price-relevant artist events ranked by impact, confidence, and recency.
            </p>
          </div>
          <div className="p-5">
            <MarketNewsFeed limit={60} variant="full" />
          </div>
        </section>
      </div>

      <aside className="space-y-5 xl:sticky xl:top-40 xl:self-start">
        <MarketRail title="Top Gainers" artists={topGainers} icon={<TrendingUp className="h-4 w-4" />} />
        <MarketRail title="Top Losers" artists={topLosers} icon={<TrendingDown className="h-4 w-4" />} />
        <MarketRail title="Most Active" artists={mostActive} score />
      </aside>
    </div>
  );
}

function MarketRail({
  title,
  artists,
  score = false,
  icon
}: {
  title: string;
  artists: Artist[];
  score?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <section className="rounded border border-line bg-panel shadow-market">
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-line bg-panelSoft px-4">
        <div className="flex items-center gap-2">
          <span className="h-5 w-1 rounded bg-brass" />
          {icon ? <span className="text-brass">{icon}</span> : null}
          <h2 className="text-sm font-black uppercase tracking-wide">{title}</h2>
        </div>
        {score ? <ScoreInfo /> : null}
      </div>
      <div className="divide-y divide-line">
        {artists.map((artist) => (
          <Link key={artist.id} href={`/artists/${artist.id}`} className="grid grid-cols-[minmax(0,1fr)_90px] gap-3 px-4 py-3">
            <span className="flex min-w-0 items-center gap-3">
              <ArtistAvatar artist={artist} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-black">{artist.name}</span>
                <span className="text-xs font-bold text-paper/50">{artist.ticker}</span>
              </span>
            </span>
            <span className="text-right text-xs font-black number-tabular">
              <span className="block">{score ? `${artist.hypeScore}/100` : formatCurrency(artist.currentPrice)}</span>
              <span className={artist.dailyChangePercent >= 0 ? "text-mint" : "text-ember"}>
                {formatPercent(artist.dailyChangePercent)}
              </span>
            </span>
            <span className="col-span-2">
              <MiniSparkline data={artist.priceHistory} positive={artist.dailyChangePercent >= 0} />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
