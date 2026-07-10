"use client";

import { MarketNewsFeed } from "@/components/MarketNewsFeed";
import { Flame, KeyRound, Medal, Music, Ticket } from "lucide-react";

const filters = [
  { label: "Releases", icon: KeyRound },
  { label: "Beef & drama", icon: Flame },
  { label: "Awards", icon: Medal },
  { label: "Tours", icon: Ticket }
];

const topics = ["#AlbumWatch", "#DissWatch", "#TourSeason", "#Breakout", "#Reviews", "#Underground"];

export default function NewsPage() {
  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_220px]">
      <main>
        <h1 className="text-3xl font-black">Market news</h1>
        <p className="mt-1 text-sm font-bold text-paper/70">Catalysts ranked by impact, confidence, and recency.</p>
        <div className="mt-4 grid gap-3">
          <MarketNewsFeed limit={40} variant="full" />
        </div>
      </main>

      <aside className="space-y-6 md:sticky md:top-6 md:self-start">
        <section>
          <h2 className="text-sm font-black">Filter by type</h2>
          <div className="mt-3 grid gap-2">
            {filters.map((filter) => {
              const Icon = filter.icon;

              return (
                <button
                  key={filter.label}
                  type="button"
                  className="flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-left text-sm font-black hover:border-cyan"
                >
                  <Icon className="h-4 w-4 text-paper/65" aria-hidden="true" />
                  {filter.label}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-black">Trending topics</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {topics.map((topic) => (
              <span key={topic} className="rounded-full bg-cyan/18 px-3 py-1 text-xs font-black text-cyan">
                {topic}
              </span>
            ))}
          </div>
        </section>

        <section className="rmi-card p-4">
          <Music className="h-5 w-5 text-cyan" aria-hidden="true" />
          <h2 className="mt-3 text-sm font-black">RMI Market Wire</h2>
          <p className="mt-2 text-sm font-bold leading-5 text-paper/60">
            News here is filtered for price relevance. Routine uploads and low-signal chatter are suppressed.
          </p>
        </section>
      </aside>
    </div>
  );
}
