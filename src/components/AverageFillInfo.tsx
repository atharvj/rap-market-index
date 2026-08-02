"use client";

import clsx from "clsx";
import { Info } from "lucide-react";

const EXPLANATION = "Your average price paid per share. Buys can fill slightly above the chart price.";

export function AverageFillInfo({
  align = "left",
  className
}: {
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <span className={clsx("group relative z-30 inline-flex align-middle", className)}>
      <button
        type="button"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-line bg-panel text-paper/45 hover:border-cyan hover:text-cyan focus:outline-none focus:ring-2 focus:ring-cyan/30"
        aria-label="Explain average fill price"
      >
        <Info className="h-3 w-3" aria-hidden="true" />
      </button>
      <span
        role="tooltip"
        className={clsx(
          "rmi-popover pointer-events-none absolute top-6 z-[140] hidden w-[min(17rem,calc(100vw-2rem))] p-3 text-left text-xs font-medium normal-case leading-5 group-focus-within:block group-hover:block",
          align === "right" ? "right-0" : "left-0"
        )}
      >
        {EXPLANATION}
      </span>
    </span>
  );
}
