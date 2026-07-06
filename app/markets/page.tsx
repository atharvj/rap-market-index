"use client";

import { ArtistAvatar } from "@/components/ArtistAvatar";
import { ChangePill } from "@/components/ChangePill";
import { useGame } from "@/components/GameProvider";
import { MiniSparkline } from "@/components/MiniSparkline";
import { ScoreInfo } from "@/components/ScoreInfo";
import { WatchlistButton } from "@/components/WatchlistButton";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import type { Artist } from "@/lib/types";
import { Search, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

export default function MarketsPage() {
  const { state } = useGame();
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
  const mostActive = useMemo(
    () => [...state.artists].sort((a, b) => b.hypeScore - a.hypeScore).slice(0, 6),
    [state.artists]
  );
  const topGainers = useMemo(
    () => [...state.artists].sort((a, b) => b.dailyChangePercent - a.dailyChangePercent).slice(0, 6),
    [state.artists]
  );
  const topLosers = useMemo(
    () => [...state.artists].sort((a, b) => a.dailyChangePercent - b.dailyChangePercent).slice(0, 6),
    [state.artists]
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <main className="min-w-0 space-y-5">
        <section className="rounded border border-line bg-panel p-5 shadow-market">
          <p className="text-[11px] font-black uppercase tracking-wide text-brass">Now Trading</p>
          <h1 className="mt-2 text-2xl font-black leading-tight sm:text-3xl">Rap Artist Exchange: Artist Shares</h1>
          <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-paper/55">
            Browse listed artists, compare daily movement, and open a quote page to trade.
          </p>
        </section>

        <section className="rounded border border-line bg-panel shadow-market">
          <div className="flex flex-col gap-3 border-b border-line p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-black">Listed Artists</h2>
              <p className="mt-1 text-xs font-bold text-paper/50">{filteredArtists.length} active securities</p>
            </div>
            <label className="relative block min-w-0 md:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/40" />
              <input
                className="h-9 w-full rounded border border-line bg-panelSoft pl-9 pr-3 text-sm font-bold outline-none placeholder:text-paper/40 focus:border-cyan focus:bg-panel"
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
                  <th className="px-4 py-3 text-right">
                    <span className="inline-flex items-center justify-end gap-1.5">
                      Score
                      <ScoreInfo />
                    </span>
                  </th>
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
                            <span className="block truncate text-sm font-black">{artist.name}</span>
                            <span className="text-xs font-bold text-paper/50">{artist.ticker}</span>
                          </span>
                        </Link>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-black number-tabular">
                      {formatCurrency(artist.currentPrice)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ChangePill value={artist.dailyChangePercent} />
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-black number-tabular">{artist.hypeScore}</td>
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
      </main>

      <aside className="space-y-5">
        <MarketRail title="Most Active" artists={mostActive} score />
        <MarketRail title="Top Gainers" artists={topGainers} icon={<TrendingUp className="h-4 w-4" />} />
        <MarketRail title="Top Losers" artists={topLosers} icon={<TrendingDown className="h-4 w-4" />} />
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
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-line bg-panelSoft px-4">
        <div className="flex items-center gap-2">
          <span className="h-5 w-1 rounded bg-brass" />
          {icon ? <span className="text-brass">{icon}</span> : null}
          <h2 className="text-xs font-black uppercase tracking-wide">{title}</h2>
        </div>
        {score ? <ScoreInfo /> : null}
      </div>
      <div className="divide-y divide-line">
        {artists.map((artist) => (
          <Link key={artist.id} href={`/artists/${artist.id}`} className="grid grid-cols-[minmax(0,1fr)_88px] gap-3 px-4 py-3 hover:bg-panelSoft/70">
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
