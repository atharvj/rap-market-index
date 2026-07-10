"use client";

import { AdminBadge } from "@/components/AdminBadge";
import { ArtistAvatar } from "@/components/ArtistAvatar";
import { useAuth } from "@/components/AuthProvider";
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
  BadgeCheck,
  Flame,
  Newspaper,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
  Trophy,
  UserPlus,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";

export default function HomePage() {
  const { session } = useAuth();
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

  return (
    <div className="space-y-5">
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-hidden rounded border border-line bg-panel shadow-market">
          <div className="flex flex-col gap-3 border-b border-line bg-panelSoft px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-brass">
                <Newspaper className="h-4 w-4" aria-hidden="true" />
                RMI Today
              </p>
              <h1 className="mt-1 text-2xl font-black leading-tight sm:text-3xl">
                Rap market open
              </h1>
              <p className="mt-1 max-w-3xl text-xs font-bold leading-5 text-paper/58">
                Artist catalysts, release momentum, fan demand, and price action ranked for today.
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
            <MarketNewsFeed limit={10} variant="home" />
          </div>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-40 xl:self-start">
          <AccountSnapshot
            signedIn={Boolean(session)}
            portfolioValue={portfolioValue}
            cashBalance={state.cashBalance}
            gainPercent={gainPercent}
            watchlistCount={watchlistArtists.length}
          />
          <section className="rounded border border-line bg-panel shadow-market">
            <SectionHeader title="Market Pulse" icon={<Activity className="h-4 w-4" aria-hidden="true" />} />
            <div className="divide-y divide-line">
              <PulseCard
                label="Market Leader"
                artist={topGainers[0]}
                icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
                tone="positive"
              />
              <PulseCard
                label="Under Pressure"
                artist={topLosers[0]}
                icon={<TrendingDown className="h-4 w-4" aria-hidden="true" />}
                tone="negative"
              />
              <PulseCard
                label="Signal Leader"
                artist={hotArtists[0]}
                icon={<Flame className="h-4 w-4" aria-hidden="true" />}
                tone="signal"
                detail={`${hotArtists[0]?.hypeScore ?? 0}/100 score`}
              />
            </div>
          </section>
        </aside>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="min-w-0 space-y-5">
          <section className="rounded border border-line bg-panel shadow-market">
            <SectionHeader
              title="Catalyst Drop Watch"
              icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
              action={
                <Link href="/markets" className="inline-flex items-center gap-1 text-cyan hover:text-cyan/75">
                  Now Trading
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              }
            />
            <div className="grid gap-3 p-3 lg:grid-cols-4">
              {marketMovers.slice(0, 4).map((artist, index) => (
                <DropWatchCard key={artist.id} artist={artist} rank={index + 1} />
              ))}
            </div>
          </section>

          <section className="rounded border border-line bg-panel shadow-market">
            <SectionHeader title="Trading Board" icon={<Activity className="h-4 w-4" aria-hidden="true" />} />
            <div className="divide-y divide-line">
              {marketMovers.slice(0, 10).map((artist) => (
                <TradingBoardRow key={artist.id} artist={artist} />
              ))}
            </div>
          </section>

          <section className="rounded border border-line bg-panel shadow-market">
            <SectionHeader title="Artists to Watch" action={<ScoreInfo />} icon={<Star className="h-4 w-4" aria-hidden="true" />} />
            <div className="grid gap-0 divide-y divide-line md:grid-cols-2 md:divide-x md:divide-y-0 lg:grid-cols-3">
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

function AccountSnapshot({
  signedIn,
  portfolioValue,
  cashBalance,
  gainPercent,
  watchlistCount
}: {
  signedIn: boolean;
  portfolioValue: number;
  cashBalance: number;
  gainPercent: number;
  watchlistCount: number;
}) {
  if (!signedIn) {
    return <SignUpPromo portfolioValue={portfolioValue} gainPercent={gainPercent} />;
  }

  return (
    <section className="overflow-hidden rounded border border-line bg-black text-white shadow-market">
      <div className="border-b border-white/10 px-4 py-4">
        <p className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-brass">
          <WalletCards className="h-4 w-4" aria-hidden="true" />
          Portfolio
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-wide text-white/40">Value</p>
            <p className="mt-1 text-xl font-black number-tabular">{formatCurrency(portfolioValue)}</p>
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-wide text-white/40">Today</p>
            <p className={clsx("mt-1 text-xl font-black number-tabular", gainPercent >= 0 ? "text-mint" : "text-ember")}>
              {formatPercent(gainPercent)}
            </p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 divide-x divide-white/10 text-xs">
        <div className="px-4 py-3">
          <p className="font-black uppercase tracking-wide text-white/40">Cash</p>
          <p className="mt-1 font-black number-tabular">{formatCurrency(cashBalance)}</p>
        </div>
        <div className="px-4 py-3">
          <p className="font-black uppercase tracking-wide text-white/40">Watchlist</p>
          <p className="mt-1 font-black number-tabular">{watchlistCount} artists</p>
        </div>
      </div>
    </section>
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

function DropWatchCard({ artist, rank }: { artist: Artist; rank: number }) {
  const positive = artist.dailyChangePercent >= 0;
  const bid = artist.currentPrice * (positive ? 0.994 : 0.986);
  const ask = artist.currentPrice * (positive ? 1.012 : 1.006);

  return (
    <Link
      href={`/artists/${artist.id}`}
      className="group overflow-hidden rounded border border-line bg-panel hover:border-cyan"
    >
      <div className="relative grid min-h-28 place-items-center overflow-hidden border-b border-line bg-gradient-to-br from-panelSoft via-brass/10 to-cyan/10">
        <span className="absolute left-3 top-3 rounded-full bg-panel/85 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-paper/55">
          #{rank} mover
        </span>
        <ArtistAvatar artist={artist} size="lg" />
      </div>
      <div className="grid gap-3 p-3">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate text-sm font-black">{artist.name}</span>
            <span className="text-xs font-bold text-paper/45">{artist.ticker}</span>
          </span>
          <span className={clsx("shrink-0 text-right text-xs font-black number-tabular", positive ? "text-mint" : "text-ember")}>
            {formatPercent(artist.dailyChangePercent)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded bg-panelSoft/65 p-2 text-[11px] font-black uppercase tracking-wide text-paper/45">
          <span>
            Bid est.
            <span className="mt-0.5 block text-xs text-paper number-tabular">{formatCurrency(bid)}</span>
          </span>
          <span>
            Ask est.
            <span className="mt-0.5 block text-xs text-paper number-tabular">{formatCurrency(ask)}</span>
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] font-black uppercase tracking-wide text-paper/45">
          <span className="inline-flex items-center gap-1.5">
            <BadgeCheck className="h-3.5 w-3.5 text-brass" aria-hidden="true" />
            Verified listing
          </span>
          <span>{artist.hypeScore}/100</span>
        </div>
      </div>
    </Link>
  );
}

function TradingBoardRow({ artist }: { artist: Artist }) {
  const positive = artist.dailyChangePercent >= 0;
  const bid = artist.currentPrice * (positive ? 0.994 : 0.986);
  const ask = artist.currentPrice * (positive ? 1.012 : 1.006);

  return (
    <Link
      href={`/artists/${artist.id}`}
      className="grid gap-3 px-4 py-3 hover:bg-panelSoft/70 md:grid-cols-[minmax(220px,1.4fr)_minmax(140px,0.8fr)_minmax(120px,0.7fr)_minmax(140px,0.9fr)_auto] md:items-center"
    >
      <span className="flex min-w-0 items-center gap-3">
        <ArtistAvatar artist={artist} size="sm" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-black">{artist.name}</span>
          <span className="text-[11px] font-bold uppercase tracking-wide text-paper/45">{artist.ticker}</span>
        </span>
      </span>
      <span className="grid grid-cols-2 gap-2 text-xs font-black number-tabular md:block md:text-right">
        <span className="block">{formatCurrency(artist.currentPrice)}</span>
        <span className={positive ? "text-mint" : "text-ember"}>{formatPercent(artist.dailyChangePercent)}</span>
      </span>
      <span className="grid grid-cols-2 gap-3 text-[11px] font-black uppercase tracking-wide text-paper/45 md:text-right">
        <span>
          Bid
          <span className="block text-xs text-paper number-tabular">{formatCurrency(bid)}</span>
        </span>
        <span>
          Ask
          <span className="block text-xs text-paper number-tabular">{formatCurrency(ask)}</span>
        </span>
      </span>
      <span className="rounded border border-line bg-panelSoft/45 px-2 py-1">
        <MiniSparkline data={artist.priceHistory} positive={positive} width={150} height={28} />
      </span>
      <span className="inline-flex min-h-8 items-center justify-center rounded bg-paper px-3 text-xs font-black text-ink">
        Trade
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
    <Link
      href={`/artists/${artist.id}`}
      className="grid gap-3 bg-panel px-4 py-4 hover:bg-panelSoft/70"
    >
      <span className="flex min-w-0 items-center gap-3">
        <ArtistAvatar artist={artist} size="sm" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-black">{artist.name}</span>
          <span className="text-xs font-bold text-paper/50">
            {artist.ticker} · {formatCurrency(artist.currentPrice)}
          </span>
        </span>
      </span>
      <span className="grid grid-cols-[minmax(0,1fr)_58px] items-end gap-3">
        <span className="rounded border border-line bg-panelSoft/45 px-2 py-1">
          <MiniSparkline data={artist.priceHistory} positive={positive} width={170} height={30} />
        </span>
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
