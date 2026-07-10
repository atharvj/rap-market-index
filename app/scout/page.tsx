"use client";

import { RmiButton } from "@/components/RmiPrimitives";
import { Info } from "lucide-react";

const scoutArtists = [
  { initials: "SV", name: "Static Vow", scene: "phonk", followers: "140K", buzz: "+340%" },
  { initials: "NL", name: "Nite Larva", scene: "hyperpop", followers: "89K", buzz: "+210%" },
  { initials: "CQ", name: "Cassque", scene: "boom bap", followers: "62K", buzz: "+128%" }
];

export default function ScoutPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-black">Scout the underground</h1>
        <p className="mt-1 text-sm font-bold text-paper/70">Unlisted artists with early buzz. Get in before they IPO onto the main market.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        {scoutArtists.map((artist) => (
          <article key={artist.name} className="rmi-card p-4">
            <div className="flex items-start justify-between gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-cyan/18 text-sm font-black text-cyan">{artist.initials}</span>
              <span className="rounded-full bg-brass/18 px-2 py-1 text-xs font-black text-brass">rising</span>
            </div>
            <h2 className="mt-4 text-base font-black">{artist.name}</h2>
            <p className="text-sm font-bold text-paper/65">{artist.followers} followers · {artist.scene}</p>
            <p className="mt-2 text-sm font-black text-mint">↗ buzz up {artist.buzz} this week</p>
            <div className="mt-4">
              <RmiButton variant="primary">Back this artist</RmiButton>
            </div>
          </article>
        ))}
      </section>

      <section className="flex items-start gap-3 rounded-xl bg-panelSoft p-4 text-sm font-bold text-paper/70">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          Backing an unlisted artist locks your stake until they either hit the listing threshold and IPO onto the main market,
          or the scouting window closes. This screen is ready for the future artist-discovery feature.
        </p>
      </section>
    </div>
  );
}
