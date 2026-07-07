"use client";

import { AdminBadge } from "@/components/AdminBadge";
import { ArtistAvatar } from "@/components/ArtistAvatar";
import { useGame } from "@/components/GameProvider";
import { MarketNewsFeed } from "@/components/MarketNewsFeed";
import { MiniSparkline } from "@/components/MiniSparkline";
import { ScoreInfo } from "@/components/ScoreInfo";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import type { Artist } from "@/lib/types";
import clsx from "clsx";
import {
  Activity,
  ArrowRight,
  Flame,
  Newspaper,
  Star,
  TrendingDown,
  TrendingUp,
  Trophy,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";

export default function HomePage() {
  const { state, leaderboard, watchlistArtists, portfolioValue, gainPercent } = useGame();
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
  const marketMovers = useMemo(
    () =>
      [...state.artists]
        .sort((a, b) => Math.abs(b.dailyChangePercent) - Math.abs(a.dailyChangePercent))
        .slice(0, 8),
    [state.artists]
  );

  const topGainer = topGainers[0];
  const topLoser = topLosers[0];
  const signalLeader = hotArtists[0];

  return (
    <div className="space-y-5">
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="rounded border border-line bg-panel shadow-market">
          <div className="flex flex-col gap-3 border-b border-line bg-panelSoft px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-brass">
                <Newspaper className="h-4 w-4" aria-hidden="true" />
                RMI Today
              </p>
              <h1 className="mt-1 text-xl font-black leading-tight sm:text-2xl">
                Market news and artist price action
              </h1>
              <p className="mt-1 max-w-2xl text-xs font-bold leading-5 text-paper/58">
                Price-relevant releases, reviews, controversy, audience momentum, and market movement.
              </p>
            </div>
            <Link
              href="/markets"
              className="inline-flex min-h-9 shrink-0 items-center justify-center rounded border border-line bg-panel px-3 text-xs font-black hover:border-cyan"
            >
              View now trading
            </Link>
          </div>
          <div className="p-4 sm:p-5">
            <MarketNewsFeed limit={11} variant="home" />
          </div>
        </div>

        <aside className="space-y-5">
          <SignUpPromo portfolioValue={portfolioValue} gainPercent={gainPercent} />
          <section className="rounded border border-line bg-panel shadow-market">
            <SectionHeader title="Market Pulse" icon={<Activity className="h-4 w-4" aria-hidden="true" />} />
            <div className="divide-y divide-line">
              <PulseCard
                label="Market Leader"
                artist={topGainer}
                icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
                tone="positive"
              />
              <PulseCard
                label="Under Pressure"
                artist={topLoser}
                icon={<TrendingDown className="h-4 w-4" aria-hidden="true" />}
                tone="negative"
              />
              <PulseCard
                label="Signal Leader"
                artist={signalLeader}
                icon={<Flame className="h-4 w-4" aria-hidden="true" />}
                tone="signal"
                detail={`${signalLeader?.hypeScore ?? 0}/100 score`}
              />
            </div>
          </section>
        </aside>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <main className="min-w-0 space-y-5">

          <section className="rounded border border-line bg-panel shadow-market">
            <SectionHeader
              title="Now Trading"
              icon={<Activity className="h-4 w-4" aria-hidden="true" />}
              action={
                <Link href="/markets" className="inline-flex items-center gap-1 text-cyan hover:text-cyan/75">
                  Now Trading
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              }
            />
            <div className="grid gap-0 divide-y divide-line md:grid-cols-2 md:divide-x md:divide-y-0">
              {marketMovers.slice(0, 4).map((artist) => (
                <MarketMoverTile key={artist.id} artist={artist} />
              ))}
            </div>
            <div className="grid gap-0 border-t border-line md:grid-cols-2 xl:grid-cols-4">
              {marketMovers.slice(4, 8).map((artist) => (
                <CompactMoverTile key={artist.id} artist={artist} />
              ))}
            </div>
          </section>

          <section className="rounded border border-line bg-panel shadow-market">
            <SectionHeader title="Artists to Watch" action={<ScoreInfo />} icon={<Star className="h-4 w-4" aria-hidden="true" />} />
            <div className="grid divide-y divide-line md:grid-cols-2 md:divide-x md:divide-y-0 lg:grid-cols-3">
              {hotArtists.slice(0, 6).map((artist) => (
                <PopularArtistCard key={artist.id} artist={artist} />
              ))}
            </div>
          </section>
        </main>

        <aside className="space-y-5">
          <section className="rounded border border-line bg-panel shadow-market">
            <SectionHeader title="Top Gainers" icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />} />
            <div className="divide-y divide-line">
              {topGainers.map((artist) => (
                <MarketMoverRow key={artist.id} artist={artist} />
              ))}
            </div>
          </section>

          <section className="rounded border border-line bg-panel shadow-market">
            <SectionHeader title="Top Losers" icon={<TrendingDown className="h-4 w-4" aria-hidden="true" />} />
            <div className="divide-y divide-line">
              {topLosers.map((artist) => (
                <MarketMoverRow key={artist.id} artist={artist} />
              ))}
            </div>
          </section>

          <section className="rounded border border-line bg-panel shadow-market">
            <SectionHeader title="Top Traders" action="Week" icon={<Trophy className="h-4 w-4" aria-hidden="true" />} />
            <div className="divide-y divide-line">
              {leaderboard.slice(0, 6).map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                  <span className="flex min-w-0 items-center gap-2">
                    <Link href={`/users/${entry.id}`} className="min-w-0 truncate font-black text-cyan hover:text-cyan/75">
                      {entry.username}
                    </Link>
                    {entry.isAdmin ? <AdminBadge compact /> : null}
                  </span>
                  <span className={entry.gainPercent >= 0 ? "font-black text-mint" : "font-black text-ember"}>
                    {formatPercent(entry.gainPercent)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded border border-line bg-panel shadow-market">
            <SectionHeader title="Watchlist" action={String(watchlistArtists.length)} icon={<Star className="h-4 w-4" aria-hidden="true" />} />
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
    </div>
  );
}

function SignUpPromo({ portfolioValue, gainPercent }: { portfolioValue: number; gainPercent: number }) {
  return (
    <section className="rounded border border-line bg-black text-white shadow-market">
      <div className="border-b border-white/10 px-4 py-3">
        <p className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-brass">
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          New traders
        </p>
        <h2 className="mt-1 text-lg font-black leading-tight">Start with $100,000 in fantasy cash.</h2>
        <p className="mt-1 text-xs font-bold leading-5 text-white/58">
          Build a portfolio, follow catalysts, and compete on the leaderboard. No real money.
        </p>
      </div>
      <div className="grid grid-cols-2 divide-x divide-white/10 text-xs">
        <div className="px-4 py-3">
          <p className="font-black uppercase tracking-wide text-white/40">Portfolio</p>
          <p className="mt-1 text-base font-black number-tabular">{formatCurrency(portfolioValue)}</p>
        </div>
        <div className="px-4 py-3">
          <p className="font-black uppercase tracking-wide text-white/40">Today</p>
          <p className={clsx("mt-1 text-base font-black number-tabular", gainPercent >= 0 ? "text-mint" : "text-ember")}>
            {formatPercent(gainPercent)}
          </p>
        </div>
      </div>
    </section>
  );
}

function SectionHeader({
  title,
  action,
  icon
}: {
  title: string;
  action?: ReactNode;
  icon?: ReactNode;
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

function PulseCard({
  label,
  artist,
  icon,
  tone,
  detail
}: {
  label: string;
  artist?: Artist;
  icon: ReactNode;
  tone: "positive" | "negative" | "signal";
  detail?: string;
}) {
  if (!artist) {
    return null;
  }

  const positive = artist.dailyChangePercent >= 0;
  const toneClass =
    tone === "negative"
      ? "text-ember"
      : tone === "signal"
        ? "text-cyan"
        : "text-mint";

  return (
    <Link href={`/artists/${artist.id}`} className="grid gap-3 border-b border-line px-4 py-4 last:border-b-0 hover:bg-panelSoft/70">
      <div className="flex items-center justify-between gap-3 text-[11px] font-black uppercase tracking-wide text-paper/45">
        <span>{label}</span>
        <span className={toneClass}>{icon}</span>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-3">
          <ArtistAvatar artist={artist} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-black">{artist.name}</span>
            <span className="text-xs font-bold text-paper/50">{artist.ticker}</span>
          </span>
        </span>
        <span className="shrink-0 text-right text-xs font-black number-tabular">
          <span className="block">{formatCurrency(artist.currentPrice)}</span>
          <span className={positive ? "text-mint" : "text-ember"}>
            {detail ?? formatPercent(artist.dailyChangePercent)}
          </span>
        </span>
      </div>
      <MiniSparkline data={artist.priceHistory} positive={positive} width={260} height={30} />
    </Link>
  );
}

function MarketMoverTile({ artist }: { artist: Artist }) {
  const positive = artist.dailyChangePercent >= 0;

  return (
    <Link href={`/artists/${artist.id}`} className="grid min-h-[180px] gap-4 p-4 hover:bg-panelSoft/70">
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-3">
          <ArtistAvatar artist={artist} size="md" />
          <span className="min-w-0">
            <span className="block truncate text-base font-black">{artist.name}</span>
            <span className="text-xs font-bold text-paper/50">
              {artist.ticker} · {formatCurrency(artist.currentPrice)}
            </span>
          </span>
        </span>
        <span className={clsx("shrink-0 rounded px-2 py-1 text-xs font-black number-tabular", positive ? "bg-mint/[0.08] text-mint" : "bg-ember/[0.08] text-ember")}>
          {formatPercent(artist.dailyChangePercent)}
        </span>
      </div>
      <div className="self-end">
        <MiniSparkline data={artist.priceHistory} positive={positive} width={220} height={44} />
        <p className="mt-2 text-[11px] font-black uppercase tracking-wide text-paper/40">{artist.hypeScore}/100 RMI score</p>
      </div>
    </Link>
  );
}

function CompactMoverTile({ artist }: { artist: Artist }) {
  const positive = artist.dailyChangePercent >= 0;

  return (
    <Link href={`/artists/${artist.id}`} className="flex min-w-0 items-center justify-between gap-3 border-b border-line px-4 py-3 hover:bg-panelSoft/70 md:border-r md:last:border-r-0 xl:border-b-0">
      <span className="min-w-0">
        <span className="block truncate text-sm font-black">{artist.name}</span>
        <span className="text-xs font-bold text-paper/50">{artist.ticker}</span>
      </span>
      <span className="shrink-0 text-right text-xs font-black number-tabular">
        <span className="block">{formatCurrency(artist.currentPrice)}</span>
        <span className={positive ? "text-mint" : "text-ember"}>{formatPercent(artist.dailyChangePercent)}</span>
      </span>
    </Link>
  );
}

function MarketMoverRow({ artist }: { artist: Artist }) {
  const positive = artist.dailyChangePercent >= 0;

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
        <span className={positive ? "text-mint" : "text-ember"}>{formatPercent(artist.dailyChangePercent)}</span>
      </span>
      <span className="col-span-2">
        <MiniSparkline data={artist.priceHistory} positive={positive} width={210} height={28} />
      </span>
    </Link>
  );
}

function PopularArtistCard({ artist }: { artist: Artist }) {
  const positive = artist.dailyChangePercent >= 0;

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
        <MiniSparkline data={artist.priceHistory} positive={positive} width={190} height={34} />
        <span className="text-right text-xs font-black number-tabular">
          <span className={positive ? "block text-mint" : "block text-ember"}>
            {formatPercent(artist.dailyChangePercent)}
          </span>
          <span className="text-paper/45">{artist.hypeScore}/100</span>
        </span>
      </span>
    </Link>
  );
}

function CompactArtistRow({ artist, detail }: { artist: Artist; detail: string }) {
  const positive = artist.dailyChangePercent >= 0;

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
        <span className={positive ? "text-mint" : "text-ember"}>
          {formatPercent(artist.dailyChangePercent)}
        </span>
      </span>
    </Link>
  );
}
