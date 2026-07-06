"use client";

import { ArtistAvatar } from "@/components/ArtistAvatar";
import { useGame } from "@/components/GameProvider";
import { MarketNewsFeed } from "@/components/MarketNewsFeed";
import { MiniSparkline } from "@/components/MiniSparkline";
import { ScoreInfo } from "@/components/ScoreInfo";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import type { Artist } from "@/lib/types";
import { Newspaper, Star, TrendingDown, TrendingUp, Trophy } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

export default function HomePage() {
  const { state, leaderboard, watchlistArtists } = useGame();
  const topGainers = useMemo(
    () => [...state.artists].sort((a, b) => b.dailyChangePercent - a.dailyChangePercent).slice(0, 6),
    [state.artists]
  );
  const topLosers = useMemo(
    () => [...state.artists].sort((a, b) => a.dailyChangePercent - b.dailyChangePercent).slice(0, 6),
    [state.artists]
  );
  const hotArtists = useMemo(
    () => [...state.artists].sort((a, b) => b.hypeScore - a.hypeScore).slice(0, 8),
    [state.artists]
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <main className="min-w-0 space-y-5">
        <section className="rounded border border-line bg-panel shadow-market">
          <div className="flex flex-col gap-3 border-b border-line bg-panelSoft px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-brass">
                <Newspaper className="h-4 w-4" aria-hidden="true" />
                <p className="text-[11px] font-black uppercase tracking-wide">Rap Market Index</p>
              </div>
              <h1 className="mt-2 text-2xl font-black leading-tight sm:text-3xl">
                Market news, artist catalysts, and price movement.
              </h1>
            </div>
            <Link
              href="/markets"
              className="inline-flex min-h-9 w-fit items-center rounded border border-line bg-panel px-3 text-xs font-black text-paper/70 hover:border-cyan hover:text-cyan"
            >
              View now trading
            </Link>
          </div>
          <div className="p-5">
            <MarketNewsFeed limit={7} variant="home" />
          </div>
        </section>

        <section className="rounded border border-line bg-panel shadow-market">
          <SectionHeader title="Popular Artists to Watch" action={<ScoreInfo />} icon={<Star className="h-4 w-4" />} />
          <div className="grid divide-y divide-line md:grid-cols-2 md:divide-x md:divide-y-0 lg:grid-cols-3">
            {hotArtists.slice(0, 6).map((artist) => (
              <PopularArtistCard key={artist.id} artist={artist} />
            ))}
          </div>
        </section>
      </main>

      <aside className="space-y-5">
        <section className="rounded border border-line bg-panel shadow-market">
          <SectionHeader title="Top Gainers" icon={<TrendingUp className="h-4 w-4" />} />
          <div className="divide-y divide-line">
            {topGainers.map((artist) => (
              <MarketMoverRow key={artist.id} artist={artist} />
            ))}
          </div>
        </section>

        <section className="rounded border border-line bg-panel shadow-market">
          <SectionHeader title="Top Losers" icon={<TrendingDown className="h-4 w-4" />} />
          <div className="divide-y divide-line">
            {topLosers.map((artist) => (
              <MarketMoverRow key={artist.id} artist={artist} />
            ))}
          </div>
        </section>

        <section className="rounded border border-line bg-panel shadow-market">
          <SectionHeader title="Top Traders" action="Week" icon={<Trophy className="h-4 w-4" />} />
          <div className="divide-y divide-line">
            {leaderboard.slice(0, 6).map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                <span className="min-w-0 truncate font-black">{entry.username}</span>
                <span className={entry.gainPercent >= 0 ? "font-black text-mint" : "font-black text-ember"}>
                  {formatPercent(entry.gainPercent)}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded border border-line bg-panel shadow-market">
          <SectionHeader title="Watchlist" action={String(watchlistArtists.length)} icon={<Star className="h-4 w-4" />} />
          <div className="divide-y divide-line">
            {watchlistArtists.length ? (
              watchlistArtists.slice(0, 6).map((artist) => (
                <CompactArtistRow key={artist.id} artist={artist} detail={formatCurrency(artist.currentPrice)} />
              ))
            ) : (
              <p className="px-4 py-4 text-xs font-bold leading-5 text-paper/50">No watchlist artists yet.</p>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}

function SectionHeader({
  title,
  action,
  icon
}: {
  title: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-b border-line bg-panelSoft px-4">
      <div className="flex items-center gap-2">
        <span className="h-5 w-1 rounded bg-brass" />
        {icon ? <span className="text-brass">{icon}</span> : null}
        <h2 className="text-xs font-black uppercase tracking-wide">{title}</h2>
      </div>
      {action ? <span className="text-[11px] font-black uppercase tracking-wide text-paper/45">{action}</span> : null}
    </div>
  );
}

function MarketMoverRow({ artist }: { artist: Artist }) {
  return (
    <Link href={`/artists/${artist.id}`} className="grid grid-cols-[minmax(0,1fr)_100px] gap-3 px-4 py-3 hover:bg-panelSoft/70">
      <span className="flex min-w-0 items-center gap-3">
        <ArtistAvatar artist={artist} size="sm" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-black">{artist.name}</span>
          <span className="text-xs font-bold text-paper/50">{artist.ticker}</span>
        </span>
      </span>
      <span className="text-right text-xs font-black number-tabular">
        <span className="block">{formatCurrency(artist.currentPrice)}</span>
        <span className={artist.dailyChangePercent >= 0 ? "text-mint" : "text-ember"}>
          {formatPercent(artist.dailyChangePercent)}
        </span>
      </span>
      <span className="col-span-2">
        <MiniSparkline data={artist.priceHistory} positive={artist.dailyChangePercent >= 0} width={210} height={28} />
      </span>
    </Link>
  );
}

function PopularArtistCard({ artist }: { artist: Artist }) {
  return (
    <Link href={`/artists/${artist.id}`} className="grid gap-3 px-4 py-4 hover:bg-panelSoft/70">
      <span className="flex min-w-0 items-center gap-3">
        <ArtistAvatar artist={artist} size="sm" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-black">{artist.name}</span>
          <span className="text-xs font-bold text-paper/50">
            {artist.ticker} · {formatCurrency(artist.currentPrice)}
          </span>
        </span>
      </span>
      <span className="grid grid-cols-[1fr_auto] items-end gap-3">
        <MiniSparkline data={artist.priceHistory} positive={artist.dailyChangePercent >= 0} width={190} height={34} />
        <span className="text-right text-xs font-black number-tabular">
          <span className={artist.dailyChangePercent >= 0 ? "block text-mint" : "block text-ember"}>
            {formatPercent(artist.dailyChangePercent)}
          </span>
          <span className="text-paper/45">{artist.hypeScore}/100</span>
        </span>
      </span>
    </Link>
  );
}

function CompactArtistRow({ artist, detail }: { artist: Artist; detail: string }) {
  return (
    <Link href={`/artists/${artist.id}`} className="flex min-w-0 items-center justify-between gap-3 px-4 py-3 hover:bg-panelSoft/70">
      <span className="flex min-w-0 items-center gap-3">
        <ArtistAvatar artist={artist} size="sm" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-black">{artist.name}</span>
          <span className="text-xs font-bold text-paper/50">{artist.ticker}</span>
        </span>
      </span>
      <span className="shrink-0 text-right text-xs font-black number-tabular">
        <span className="block">{detail}</span>
        <span className={artist.dailyChangePercent >= 0 ? "text-mint" : "text-ember"}>
          {formatPercent(artist.dailyChangePercent)}
        </span>
      </span>
    </Link>
  );
}
