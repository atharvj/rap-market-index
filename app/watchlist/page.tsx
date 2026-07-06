"use client";

import { ArtistAvatar } from "@/components/ArtistAvatar";
import { ChangePill } from "@/components/ChangePill";
import { useGame } from "@/components/GameProvider";
import { MetricCard } from "@/components/MetricCard";
import { TradeTicket } from "@/components/TradeTicket";
import { WatchlistButton } from "@/components/WatchlistButton";
import { formatCurrency } from "@/lib/formatters";
import { BarChart3, Signal, Star, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

export default function WatchlistPage() {
  const { watchlistArtists, getArtist } = useGame();
  const [selectedArtistId, setSelectedArtistId] = useState(watchlistArtists[0]?.id ?? "");
  const selectedArtist = getArtist(selectedArtistId) ?? watchlistArtists[0];
  const topMover = useMemo(
    () => [...watchlistArtists].sort((a, b) => b.dailyChangePercent - a.dailyChangePercent)[0],
    [watchlistArtists]
  );
  const averageSignal =
    watchlistArtists.reduce((total, artist) => total + artist.hypeScore, 0) / Math.max(1, watchlistArtists.length);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-brass">Watchlist</p>
        <h1 className="mt-2 text-4xl font-black">Tracked listings</h1>
      </div>

      <section className="grid gap-3 md:grid-cols-3">
        <MetricCard
          label="Listings"
          value={String(watchlistArtists.length)}
          detail="Saved to your account"
          icon={<Star className="h-4 w-4" />}
          tone="warm"
        />
        <MetricCard
          label="Top mover"
          value={topMover?.ticker ?? "N/A"}
          detail={topMover ? `${formatCurrency(topMover.currentPrice)} last price` : "No tracked listings"}
          icon={<TrendingUp className="h-4 w-4" />}
          tone={topMover && topMover.dailyChangePercent < 0 ? "bad" : "good"}
        />
        <MetricCard
          label="Avg signal"
          value={watchlistArtists.length ? averageSignal.toFixed(0) : "0"}
          detail="Mean signal score"
          icon={<Signal className="h-4 w-4" />}
          tone="cool"
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded border border-line bg-panel shadow-market">
          <div className="border-b border-line p-4">
            <h2 className="text-xl font-black">Watchlist board</h2>
          </div>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[660px] border-collapse">
              <thead>
                <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-paper/40">
                  <th className="px-4 py-3">Artist</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">Daily</th>
                  <th className="px-4 py-3 text-right">Signal</th>
                  <th className="px-4 py-3 text-right">Trade</th>
                </tr>
              </thead>
              <tbody>
                {watchlistArtists.length ? (
                  watchlistArtists.map((artist) => (
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
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedArtistId(artist.id)}
                          className="inline-flex min-h-9 items-center gap-2 rounded border border-brass/35 bg-brass/10 px-3 text-sm font-black text-brass hover:bg-brass/[0.15]"
                        >
                          <BarChart3 className="h-4 w-4" />
                          Select
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-10 text-center text-paper/50" colSpan={5}>
                      No watched listings yet. Add artists from the market board.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="lg:sticky lg:top-36 lg:self-start">
          {selectedArtist ? (
            <TradeTicket artist={selectedArtist} />
          ) : (
            <section className="rounded border border-line bg-panel p-4 text-sm font-bold text-paper/50 shadow-market">
              Select watched artists from the market board to build a tracking list.
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
