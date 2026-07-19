"use client";

import { MARKET_SCORE_EXPLANATION } from "@/lib/artist-explanations";
import clsx from "clsx";
import { Info } from "lucide-react";

export function ScoreInfo({ className }: { className?: string }) {
  return (
    <span className={clsx("group relative z-30 inline-flex align-middle", className)}>
      <button
        type="button"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-line bg-panel text-paper/45 hover:border-cyan hover:text-cyan focus:outline-none focus:ring-2 focus:ring-cyan/30"
        aria-label="Explain RMI Score"
      >
        <Info className="h-3 w-3" aria-hidden="true" />
      </button>
      <span
        role="tooltip"
        className="rmi-popover pointer-events-none absolute left-0 right-auto top-6 z-[140] hidden w-[min(18rem,calc(100vw-2rem))] p-3 text-left text-xs font-medium normal-case leading-5 group-focus-within:block group-hover:block sm:left-auto sm:right-0"
      >
        {MARKET_SCORE_EXPLANATION}
      </span>
    </span>
  );
}
