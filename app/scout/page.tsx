"use client";

import { useGame } from "@/components/GameProvider";
import { ArtistMiniCard, RmiButton } from "@/components/RmiPrimitives";
import { Info, Radar } from "lucide-react";
import { useMemo } from "react";

export default function ScoutPage() {
  const { state } = useGame();
  const emergingArtists = useMemo(
    () =>
      [...state.artists]
        .filter((artist) => artist.category === "underground" || artist.category === "rising")
        .sort((first, second) => {
          const firstSignal = first.hypeScore + Math.max(0, first.dailyChangePercent) * 4;
          const secondSignal = second.hypeScore + Math.max(0, second.dailyChangePercent) * 4;
          return secondSignal - firstSignal;
        })
        .slice(0, 12),
    [state.artists]
  );

  return (
    <div className="space-y-6">
      <header className="grid gap-5 rounded-xl border border-line bg-panel p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-cyan">
            <Radar className="h-4 w-4" aria-hidden="true" />
            Discovery
          </div>
          <h1 className="mt-3 text-3xl font-black">Scout Emerging Artists</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-paper/65">
            Explore smaller artists already trading on RMI, ranked by current market signal and momentum.
          </p>
        </div>
        <RmiButton href="/markets" variant="secondary">View Every Market</RmiButton>
      </header>

      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
          <h2 className="text-lg font-black">On the Radar</h2>
            <p className="mt-1 text-sm text-paper/55">Smaller active listings showing the strongest current RMI signals.</p>
          </div>
          <span className="text-xs text-paper/45">{emergingArtists.length} shown</span>
        </div>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
          {emergingArtists.map((artist) => <ArtistMiniCard key={artist.id} artist={artist} />)}
        </div>
      </section>

      <section className="flex items-start gap-3 rounded-xl bg-panelSoft p-4 text-sm leading-6 text-paper/65">
        <Info className="mt-1 h-4 w-4 shrink-0 text-cyan" aria-hidden="true" />
        <p>
          Scout highlights active artists with rising audience, media, and market momentum. Open a listing to review its price history and current catalysts.
        </p>
      </section>
    </div>
  );
}
