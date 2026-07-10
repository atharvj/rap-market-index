"use client";

import { ArtistAvatar } from "@/components/ArtistAvatar";
import { useGame } from "@/components/GameProvider";
import { RmiButton } from "@/components/RmiPrimitives";
import { Check } from "lucide-react";
import { useMemo, useState } from "react";

export default function OnboardingPage() {
  const { state, toggleWatchlist, isWatchlisted } = useGame();
  const artists = useMemo(() => [...state.artists].sort((a, b) => b.hypeScore - a.hypeScore).slice(0, 6), [state.artists]);
  const [selected, setSelected] = useState<string[]>([]);

  async function toggle(artistId: string) {
    setSelected((current) =>
      current.includes(artistId) ? current.filter((id) => id !== artistId) : current.length < 5 ? [...current, artistId] : current
    );
    if (!isWatchlisted(artistId)) {
      await toggleWatchlist(artistId);
    }
  }

  return (
    <div className="mx-auto max-w-[520px] space-y-5">
      <div className="flex items-center justify-center gap-2 font-black">
        <span className="text-cyan">RMI</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <span className="h-1 rounded bg-paper" />
        <span className="h-1 rounded bg-paper" />
        <span className="h-1 rounded bg-panelSoft" />
        <span className="h-1 rounded bg-panelSoft" />
      </div>
      <header>
        <p className="text-sm font-bold text-paper/55">step 2 of 4</p>
        <h1 className="text-3xl font-black">Pick 5 artists to follow</h1>
        <p className="mt-1 text-sm font-bold text-paper/70">We'll build your homepage and watchlist around these.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        {artists.map((artist) => {
          const active = selected.includes(artist.id);

          return (
            <button
              key={artist.id}
              type="button"
              onClick={() => toggle(artist.id)}
              className={active ? "rmi-card flex items-center justify-between gap-3 border-cyan p-4 text-left" : "rmi-card flex items-center justify-between gap-3 p-4 text-left"}
            >
              <span className="flex min-w-0 items-center gap-3">
                <ArtistAvatar artist={artist} />
                <span className="truncate text-sm font-black">{artist.name}</span>
              </span>
              {active ? <Check className="h-4 w-4 text-cyan" /> : null}
            </button>
          );
        })}
      </section>

      <p className="text-center text-sm font-bold text-paper/55">{selected.length} of 5 selected</p>
      <div className="grid grid-cols-2 gap-2">
        <RmiButton href="/" variant="secondary">Back</RmiButton>
        <RmiButton href="/portfolio">Continue</RmiButton>
      </div>
    </div>
  );
}
