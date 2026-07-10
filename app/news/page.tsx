"use client";

import { useGame } from "@/components/GameProvider";
import { MarketNewsFeed } from "@/components/MarketNewsFeed";
import { ArtistIdentity, ChangeText, RmiButton } from "@/components/RmiPrimitives";
import { Music, ShieldCheck } from "lucide-react";
import { useMemo } from "react";

export default function NewsPage() {
  const { state } = useGame();
  const movers = useMemo(
    () => [...state.artists].sort((a, b) => Math.abs(b.dailyChangePercent) - Math.abs(a.dailyChangePercent)).slice(0, 5),
    [state.artists]
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_320px]">
      <main className="min-w-0">
        <h1 className="text-3xl font-black">Market News</h1>
        <p className="mt-1 text-sm text-paper/65">The most important verified catalysts, ranked by impact, confidence, and recency.</p>
        <div className="mt-5 rmi-card px-5">
          <MarketNewsFeed limit={40} variant="full" />
        </div>
      </main>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <section className="rmi-card overflow-hidden">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-sm font-black">Moving With the News</h2>
          </div>
          {movers.map((artist) => (
            <div key={artist.id} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
              <ArtistIdentity artist={artist} />
              <ChangeText value={artist.dailyChangePercent} />
            </div>
          ))}
          <div className="p-4"><RmiButton href="/markets" variant="secondary">View Markets</RmiButton></div>
        </section>

        <section className="rmi-card p-4">
          <Music className="h-5 w-5 text-cyan" aria-hidden="true" />
          <h2 className="mt-3 text-sm font-black">RMI Market Wire</h2>
          <p className="mt-2 text-sm leading-6 text-paper/60">
            Routine uploads, reposts, and low-signal chatter are excluded. A story must clear evidence and relevance checks before it appears here.
          </p>
        </section>

        <section className="flex items-start gap-3 rounded-xl bg-panelSoft p-4 text-xs leading-5 text-paper/55">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-mint" aria-hidden="true" />
          <p>News can inform a quote, but no single headline determines an artist price by itself.</p>
        </section>
      </aside>
    </div>
  );
}
