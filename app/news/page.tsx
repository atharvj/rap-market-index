"use client";

import { useGame } from "@/components/GameProvider";
import { MarketNewsFeed, type MarketNewsItem } from "@/components/MarketNewsFeed";
import { ArtistIdentity, ChangeText, RmiButton } from "@/components/RmiPrimitives";
import type { MarketNewsSort } from "@/lib/market-news-sort";
import { ArrowUpDown, Music, ShieldCheck } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

export default function NewsPage() {
  const { state } = useGame();
  const [newsArtistIds, setNewsArtistIds] = useState<Set<string>>(new Set());
  const [newsSort, setNewsSort] = useState<MarketNewsSort>("top");
  const movers = useMemo(
    () => [...state.artists]
      .filter((artist) => newsArtistIds.has(artist.id) && Math.abs(artist.dailyChangePercent) >= 0.01)
      .sort((a, b) => Math.abs(b.dailyChangePercent) - Math.abs(a.dailyChangePercent))
      .slice(0, 5),
    [newsArtistIds, state.artists]
  );
  const handleNewsItems = useCallback((items: MarketNewsItem[]) => {
    setNewsArtistIds(new Set(items.flatMap((item) => [
      item.artistId,
      ...(item.relatedArtists ?? []).map((artist) => artist.artistId)
    ])));
  }, []);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_320px]">
      <main className="min-w-0">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-black">Market News</h1>
            <p className="mt-1 text-sm text-paper/65">Verified catalysts with source, relevance, and evidence checks.</p>
          </div>
          <label className="flex w-full items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-xs font-bold text-paper/55 sm:w-auto">
            <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
            <span>Sort</span>
            <select
              value={newsSort}
              onChange={(event) => setNewsSort(event.target.value as MarketNewsSort)}
              className="min-w-32 bg-transparent font-black text-paper outline-none"
              aria-label="Sort market news"
            >
              <option value="top">Top Stories</option>
              <option value="latest">Latest</option>
              <option value="impact">Highest Impact</option>
              <option value="confidence">Most Verified</option>
            </select>
          </label>
        </div>
        <div className="mt-5 rmi-card px-5">
          <MarketNewsFeed limit={40} variant="full" sort={newsSort} onItemsChange={handleNewsItems} />
        </div>
      </main>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <section className="rmi-card overflow-hidden">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-sm font-black">News-Linked Movers</h2>
          </div>
          {movers.length ? movers.map((artist) => (
              <div key={artist.id} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
                <ArtistIdentity artist={artist} />
                <ChangeText value={artist.dailyChangePercent} />
              </div>
            )) : (
              <p className="px-4 py-5 text-sm leading-6 text-paper/50">
                No artist with a verified story is making a material quote move right now.
              </p>
            )}
          <div className="p-4"><RmiButton href="/markets" variant="secondary">View Markets</RmiButton></div>
        </section>

        <section className="rmi-card p-4">
          <Music className="h-5 w-5 text-cyan" aria-hidden="true" />
          <h2 className="mt-3 text-sm font-black">RMI Market Wire</h2>
          <p className="mt-2 text-sm leading-6 text-paper/60">
            Routine uploads, reposts, and low-signal chatter are excluded. A story must clear evidence and relevance checks before it appears here.
          </p>
        </section>

        <section className="flex items-start gap-3 rounded-lg bg-panelSoft p-4 text-xs leading-5 text-paper/55">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-mint" aria-hidden="true" />
          <p>News can inform a quote, but no single headline determines an artist price by itself.</p>
        </section>
      </aside>
    </div>
  );
}
