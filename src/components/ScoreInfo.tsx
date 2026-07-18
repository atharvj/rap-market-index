"use client";

import { MARKET_SCORE_EXPLANATION } from "@/lib/artist-explanations";
import clsx from "clsx";
import { Info } from "lucide-react";

export function ScoreInfo({ className }: { className?: string }) {
  return (
    <span className={clsx("group relative inline-flex align-middle", className)}>
      <button
        type="button"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-line bg-panel text-paper/45 hover:border-cyan hover:text-cyan focus:outline-none focus:ring-2 focus:ring-cyan/30"
        aria-label="Explain RMI Score"
      >
        <Info className="h-3 w-3" aria-hidden="true" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-6 z-[120] hidden w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-line bg-panel p-3 text-left text-xs font-bold normal-case leading-5 text-paper shadow-2xl group-focus-within:block group-hover:block"
      >
        {MARKET_SCORE_EXPLANATION}
      </span>
    </span>
  );
}
