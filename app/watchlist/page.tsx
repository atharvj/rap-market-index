"use client";

import { ArtistAvatar } from "@/components/ArtistAvatar";
import { useGame } from "@/components/GameProvider";
import { ArtistIdentity, ChangeText, RmiButton, RmiLineChart, RmiSection } from "@/components/RmiPrimitives";
import { WatchlistButton } from "@/components/WatchlistButton";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import { buildMarketIndexSeries, getMarketBreadth, getSeriesChangePercent } from "@/lib/market-analytics";
import Link from "next/link";
import { useMemo } from "react";

export default function WatchlistPage() {
  const { watchlistArtists } = useGame();
  const watchlistIndex = useMemo(() => buildMarketIndexSeries(watchlistArtists), [watchlistArtists]);
  const indexChange = getSeriesChangePercent(watchlistIndex);
  const breadth = getMarketBreadth(watchlistArtists);
  const biggestMover = [...watchlistArtists].sort(
    (first, second) => Math.abs(second.dailyChangePercent) - Math.abs(first.dailyChangePercent)
  )[0];
  const signalLeader = [...watchlistArtists].sort((first, second) => second.hypeScore - first.hypeScore)[0];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">Watchlist</h1>
          <p className="mt-1 text-sm font-bold text-paper/70">{watchlistArtists.length} artists you're tracking</p>
        </div>
        <RmiButton href="/markets" variant="secondary">+ Add artist</RmiButton>
      </header>

      {watchlistArtists.length ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <RmiSection
            title="Watchlist Trend"
            subtitle="Equal-weight performance of the artists you follow over recorded quote history."
            action={
              <span className={indexChange >= 0 ? "text-sm font-black text-mint number-tabular" : "text-sm font-black text-ember number-tabular"}>
                {formatPercent(indexChange)}
              </span>
            }
          >
            <div className="h-40 p-4">
              <RmiLineChart data={watchlistIndex} positive={indexChange >= 0} height={150} />
            </div>
          </RmiSection>

          <RmiSection title="Watchlist Briefing" subtitle="The strongest signals inside your saved list.">
            <div className="divide-y divide-line">
              {biggestMover ? <WatchlistInsight label="Biggest Move" artist={biggestMover} value={<ChangeText value={biggestMover.dailyChangePercent} />} /> : null}
              {signalLeader ? <WatchlistInsight label="Signal Leader" artist={signalLeader} value={`${signalLeader.hypeScore}/100`} /> : null}
              <div className="grid grid-cols-3 gap-2 p-4 text-center text-xs">
                <BriefingCount label="Up" value={breadth.advancers} tone="good" />
                <BriefingCount label="Down" value={breadth.decliners} tone="bad" />
                <BriefingCount label="Flat" value={breadth.unchanged} />
              </div>
            </div>
          </RmiSection>
        </div>
      ) : null}

      <section className="rmi-card overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1fr)_78px_64px_40px] gap-x-3 border-b border-line px-4 py-3 text-xs font-bold text-paper/45 sm:grid-cols-[minmax(0,1fr)_96px_76px_60px_40px]">
          <span>artist</span>
          <span className="text-right">price</span>
          <span className="text-right">24h</span>
          <span className="hidden text-right sm:block">signal</span>
          <span className="sr-only">remove from watchlist</span>
        </div>
        {watchlistArtists.length ? (
          watchlistArtists.map((artist) => (
            <div
              key={artist.id}
              className="grid grid-cols-[minmax(0,1fr)_78px_64px_40px] items-center gap-x-3 border-b border-line px-4 py-3 last:border-b-0 hover:bg-panelSoft sm:grid-cols-[minmax(0,1fr)_96px_76px_60px_40px]"
            >
              <Link href={`/artists/${artist.id}`} className="flex min-w-0 items-center gap-3">
                <ArtistAvatar artist={artist} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black">{artist.name}</span>
                  <span className="text-xs font-bold text-paper/45">${artist.ticker}</span>
                </span>
              </Link>
              <span className="text-right text-sm font-black number-tabular">{formatCurrency(artist.currentPrice)}</span>
              <span className="text-right text-xs">
                <ChangeText value={artist.dailyChangePercent} />
              </span>
              <span className="hidden text-right text-xs font-black text-paper/55 sm:block">{artist.hypeScore}</span>
              <WatchlistButton artistId={artist.id} />
            </div>
          ))
        ) : (
          <div className="grid min-h-48 place-items-center p-6 text-center">
            <div>
              <h2 className="text-lg font-black">Build your market radar</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-paper/55">
                Save artists to compare their quote movement, signal strength, and verified catalysts in one place.
              </p>
              <div className="mt-4"><RmiButton href="/markets">Browse Markets</RmiButton></div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function WatchlistInsight({ label, artist, value }: { label: string; artist: Parameters<typeof ArtistIdentity>[0]["artist"]; value: React.ReactNode }) {
  return (
    <div className="p-4">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-paper/40">{label}</p>
      <div className="flex items-center justify-between gap-3">
        <ArtistIdentity artist={artist} />
        <span className="text-sm font-black number-tabular">{value}</span>
      </div>
    </div>
  );
}

function BriefingCount({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "good" | "bad" }) {
  return (
    <div className="rounded-lg bg-panelSoft px-2 py-3">
      <p className="text-paper/45">{label}</p>
      <p className={tone === "good" ? "mt-1 font-black text-mint" : tone === "bad" ? "mt-1 font-black text-ember" : "mt-1 font-black"}>{value}</p>
    </div>
  );
}
