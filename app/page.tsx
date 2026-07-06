"use client";

import { ArtistAvatar } from "@/components/ArtistAvatar";
import { ChangePill } from "@/components/ChangePill";
import { useGame } from "@/components/GameProvider";
import { MarketNewsFeed } from "@/components/MarketNewsFeed";
import { MiniSparkline } from "@/components/MiniSparkline";
import { WatchlistButton } from "@/components/WatchlistButton";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import type { Artist } from "@/lib/types";
import { BarChart3, Info, Newspaper, Search, Star, Trophy, WalletCards } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

export default function MarketPage() {
  const { state, portfolioValue, portfolioDayChange, leaderboard, watchlistArtists } = useGame();
  const [query, setQuery] = useState("");
  const filteredArtists = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return state.artists.filter(
      (artist) =>
        !normalizedQuery ||
        artist.name.toLowerCase().includes(normalizedQuery) ||
        artist.ticker.toLowerCase().includes(normalizedQuery)
    );
  }, [query, state.artists]);
  const topGainers = useMemo(
    () => [...state.artists].sort((a, b) => b.dailyChangePercent - a.dailyChangePercent).slice(0, 5),
    [state.artists]
  );
  const topLosers = useMemo(
    () => [...state.artists].sort((a, b) => a.dailyChangePercent - b.dailyChangePercent).slice(0, 5),
    [state.artists]
  );
  const hotArtists = useMemo(
    () => [...state.artists].sort((a, b) => b.hypeScore - a.hypeScore).slice(0, 6),
    [state.artists]
  );
  const marketMover = topGainers[0];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-5">
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="rounded border border-line bg-panel shadow-market">
            <SectionHeader title="Market News" action="Latest" icon={<Newspaper className="h-4 w-4" />} />
            <div className="px-4">
              <MarketNewsFeed limit={7} compact />
            </div>
          </section>

          <section className="rounded border border-line bg-panel shadow-market">
            <div className="border-b border-line bg-panelSoft p-5">
              <p className="text-xs font-black uppercase tracking-wide text-brass">Market pulse</p>
              <h1 className="mt-2 text-2xl font-black leading-tight">Rap Market Index</h1>
              <p className="mt-2 text-sm font-bold leading-6 text-paper/55">
                Prices, catalysts, artist momentum, and portfolio tracking.
              </p>
            </div>
            <div className="p-5">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-paper/45">Market leader</p>
                {marketMover ? (
                  <Link href={`/artists/${marketMover.id}`} className="mt-3 flex min-w-0 items-center gap-4">
                    <ArtistAvatar artist={marketMover} size="lg" />
                    <span className="min-w-0">
                      <span className="block truncate text-2xl font-black">{marketMover.name}</span>
                      <span className="mt-1 block text-sm font-bold text-paper/50">{marketMover.ticker}</span>
                    </span>
                  </Link>
                ) : null}
                {marketMover ? (
                  <div className="mt-4">
                    <ChangePill value={marketMover.dailyChangePercent} />
                  </div>
                ) : null}
              </div>

              <div className="mt-5 grid gap-3">
                <SnapshotMetric label="Cash" value={formatCurrency(state.cashBalance)} icon={<WalletCards className="h-4 w-4" />} />
                <SnapshotMetric
                  label="Portfolio"
                  value={formatCurrency(portfolioValue)}
                  detail={`${portfolioDayChange >= 0 ? "+" : ""}${formatCurrency(portfolioDayChange)} today`}
                  positive={portfolioDayChange >= 0}
                  icon={<BarChart3 className="h-4 w-4" />}
                />
                <SnapshotMetric
                  label="Watchlist"
                  value={String(watchlistArtists.length)}
                  detail="Tracked artists"
                  icon={<Star className="h-4 w-4" />}
                />
              </div>
            </div>
          </section>
        </section>

        <section className="rounded border border-line bg-panel shadow-market">
          <div className="flex flex-col gap-3 border-b border-line p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-black">Now Trading</h2>
              <p className="mt-1 text-sm font-bold text-paper/50">{filteredArtists.length} listed artists</p>
            </div>
            <label className="relative block min-w-0 md:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/40" />
              <input
                className="h-10 w-full rounded border border-line bg-panelSoft pl-9 pr-3 text-sm font-bold outline-none placeholder:text-paper/40 focus:border-cyan focus:bg-panel"
                placeholder="Search artist or ticker"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>

          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr className="border-b border-line bg-panelSoft text-left text-[11px] font-black uppercase tracking-wide text-paper/50">
                  <th className="px-4 py-3">Artist</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">Change</th>
                  <th className="px-4 py-3 text-right">Score</th>
                  <th className="px-4 py-3 text-center">Trend</th>
                  <th className="px-4 py-3 text-right">Open</th>
                </tr>
              </thead>
              <tbody>
                {filteredArtists.map((artist) => (
                  <tr key={artist.id} className="border-b border-line last:border-0 hover:bg-panelSoft/70">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <WatchlistButton artistId={artist.id} />
                        <Link href={`/artists/${artist.id}`} className="flex min-w-0 items-center gap-3">
                          <ArtistAvatar artist={artist} />
                          <span className="min-w-0">
                            <span className="block truncate font-black">{artist.name}</span>
                            <span className="text-sm font-bold text-paper/50">{artist.ticker}</span>
                          </span>
                        </Link>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-black number-tabular">
                      {formatCurrency(artist.currentPrice)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ChangePill value={artist.dailyChangePercent} />
                    </td>
                    <td className="px-4 py-3 text-right font-black number-tabular">{artist.hypeScore}</td>
                    <td className="px-4 py-3 text-center">
                      <MiniSparkline data={artist.priceHistory} positive={artist.dailyChangePercent >= 0} />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/artists/${artist.id}`}
                        className="ml-auto flex min-h-8 w-fit items-center rounded border border-line bg-panel px-3 text-xs font-black text-paper/70 hover:border-cyan hover:text-cyan"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

      </div>

      <aside className="space-y-5">
        <MarketList title="Top Gainers" artists={topGainers} />
        <MarketList title="Top Losers" artists={topLosers} />

        <section className="rounded border border-line bg-panel shadow-market">
          <SectionHeader title="Hot Artists" action="Score" />
          <div className="divide-y divide-line">
            {hotArtists.map((artist) => (
              <CompactArtistRow key={artist.id} artist={artist} detail={`${artist.hypeScore}/100`} />
            ))}
          </div>
        </section>

        <section className="rounded border border-line bg-panel p-4 shadow-market">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-brass" aria-hidden="true" />
            <h2 className="text-sm font-black uppercase tracking-wide">RMI Score</h2>
          </div>
          <p className="mt-3 text-sm font-bold leading-6 text-paper/55">
            A 1-99 artist market signal built from audience momentum, video activity, public attention, releases,
            reviews, and trading demand.
          </p>
        </section>

        <section className="rounded border border-line bg-panel shadow-market">
          <SectionHeader title="Top Traders" action="This Week" icon={<Trophy className="h-4 w-4" />} />
          <div className="divide-y divide-line">
            {leaderboard.slice(0, 6).map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 truncate font-black">{entry.username}</span>
                <span className={entry.gainPercent >= 0 ? "font-black text-mint" : "font-black text-ember"}>
                  {formatPercent(entry.gainPercent)}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded border border-line bg-panel shadow-market">
          <SectionHeader title="Watchlist" action={`${watchlistArtists.length}`} icon={<Star className="h-4 w-4" />} />
          <div className="divide-y divide-line">
            {watchlistArtists.length ? (
              watchlistArtists.slice(0, 6).map((artist) => (
                <CompactArtistRow key={artist.id} artist={artist} detail={formatCurrency(artist.currentPrice)} />
              ))
            ) : (
              <p className="px-4 py-4 text-sm font-bold text-paper/50">No watchlist artists yet.</p>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}

function SectionHeader({ title, action, icon }: { title: string; action?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 border-b border-line bg-panelSoft px-4">
      <div className="flex items-center gap-2">
        <span className="h-5 w-1 rounded bg-brass" />
        {icon ? <span className="text-brass">{icon}</span> : null}
        <h2 className="text-sm font-black uppercase tracking-wide">{title}</h2>
      </div>
      {action ? <span className="text-xs font-black uppercase tracking-wide text-paper/40">{action}</span> : null}
    </div>
  );
}

function SnapshotMetric({
  label,
  value,
  detail,
  positive,
  icon
}: {
  label: string;
  value: string;
  detail?: string;
  positive?: boolean;
  icon: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded border border-line bg-panel px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-[11px] font-black uppercase tracking-wide text-paper/50">{label}</p>
        <span className="text-paper/40">{icon}</span>
      </div>
      <p className="mt-2 truncate text-lg font-black number-tabular sm:text-xl">{value}</p>
      {detail ? (
        <p className={positive ? "mt-1 truncate text-xs font-bold text-mint" : "mt-1 truncate text-xs font-bold text-paper/50"}>
          {detail}
        </p>
      ) : null}
    </div>
  );
}

function MarketList({ title, artists }: { title: string; artists: Artist[] }) {
  return (
    <section className="rounded border border-line bg-panel shadow-market">
      <SectionHeader title={title} />
      <div className="divide-y divide-line">
        {artists.map((artist) => (
          <div key={artist.id} className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-4 px-4 py-3">
            <CompactArtistRow artist={artist} detail={formatCurrency(artist.currentPrice)} flush />
            <MiniSparkline data={artist.priceHistory} positive={artist.dailyChangePercent >= 0} />
          </div>
        ))}
      </div>
    </section>
  );
}

function CompactArtistRow({
  artist,
  detail,
  flush = false
}: {
  artist: Artist;
  detail: string;
  flush?: boolean;
}) {
  return (
    <Link
      href={`/artists/${artist.id}`}
      className={flush ? "flex min-w-0 items-center gap-3" : "flex min-w-0 items-center justify-between gap-3 px-4 py-3"}
    >
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
