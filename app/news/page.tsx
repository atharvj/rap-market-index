"use client";

import { useGame } from "@/components/GameProvider";
import { MarketNewsFeed, type MarketNewsItem } from "@/components/MarketNewsFeed";
import { ArtistIdentity, ChangeText, RmiButton } from "@/components/RmiPrimitives";
import type { MarketNewsSort } from "@/lib/market-news-sort";
import { ArrowUpDown, Music, Radio, ShieldCheck, Sparkles } from "lucide-react";
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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_292px] xl:grid-cols-[minmax(0,1fr)_330px]">
      <main className="min-w-0">
        <div className="rmi-page-head flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="rmi-kicker"><Radio className="h-4 w-4" /> RMI Market Wire</div>
            <h1 className="mt-3 text-4xl font-black">Market Intelligence</h1>
            <p className="mt-2 max-w-2xl text-sm text-paper/60">Verified artist catalysts ranked by impact, confidence, and recency before they reach the public feed.</p>
          </div>
          <label className="rmi-terminal-input flex w-full items-center gap-2 px-3 text-xs font-bold text-paper/55 sm:w-auto">
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
        <div className="rmi-card rmi-noise mt-5 px-5">
          <MarketNewsFeed limit={40} variant="full" sort={newsSort} onItemsChange={handleNewsItems} />
        </div>
      </main>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <section className="rmi-card overflow-hidden">
          <div className="rmi-section-header px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-black"><Sparkles className="h-4 w-4 text-violet" /> News-Linked Movers</h2>
          </div>
          {movers.length ? movers.map((artist) => (
              <div key={artist.id} className="rmi-table-row flex items-center justify-between gap-3 px-4 py-3 last:border-b-0">
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

        <section className="rmi-card rmi-news-card p-4">
          <Music className="h-5 w-5 text-cyan" aria-hidden="true" />
          <h2 className="mt-3 text-sm font-black">RMI Market Wire</h2>
          <p className="mt-2 text-sm leading-6 text-paper/60">
            Routine uploads, reposts, and low-signal chatter are excluded. A story must clear evidence and relevance checks before it appears here.
          </p>
        </section>

        <section className="rmi-soft-card flex items-start gap-3 p-4 text-xs leading-5 text-paper/55">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-mint" aria-hidden="true" />
          <p>News can inform a quote, but no single headline determines an artist price by itself.</p>
        </section>
      </aside>
    </div>
  );
}
