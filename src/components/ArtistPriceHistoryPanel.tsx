"use client";

import { PriceChart } from "@/components/PriceChart";
import { formatDate } from "@/lib/formatters";
import type { PricePoint } from "@/lib/types";
import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";

type HistoryRange = "1D" | "7D" | "1M" | "3M" | "6M" | "1Y" | "ALL";

type HistoryResponse = {
  ok: boolean;
  error?: string;
  range?: HistoryRange;
  points?: PricePoint[];
  hasRealHistory?: boolean;
  historyStart?: string | null;
  historyEnd?: string | null;
};

const ranges: HistoryRange[] = ["1D", "7D", "1M", "3M", "6M", "1Y", "ALL"];

export function ArtistPriceHistoryPanel({
  artistId,
  fallbackData
}: {
  artistId: string;
  fallbackData: PricePoint[];
}) {
  const [range, setRange] = useState<HistoryRange>("1M");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [history, setHistory] = useState<PricePoint[]>(fallbackData);
  const [hasRealHistory, setHasRealHistory] = useState(fallbackData.length > 0);

  useEffect(() => {
    const controller = new AbortController();

    setStatus("loading");

    fetch(`/api/market/history/${artistId}?range=${range}`, {
      signal: controller.signal
    })
      .then((response) => response.json() as Promise<HistoryResponse>)
      .then((payload) => {
        if (!payload.ok || !payload.points) {
          throw new Error(payload.error ?? "Could not load price history.");
        }

        setHistory(payload.points);
        setHasRealHistory(Boolean(payload.hasRealHistory));
        setStatus("ready");
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }

        setHistory(fallbackData);
        setHasRealHistory(false);
        setStatus(error instanceof Error ? "error" : "error");
      });

    return () => {
      controller.abort();
    };
  }, [artistId, fallbackData, range]);

  const subtitle = useMemo(() => {
    if (status === "loading") {
      return "Loading";
    }

    if (history.length <= 1 || !hasRealHistory) {
      return "Since listing";
    }

    return `${formatDate(history[0].date)} - ${formatDate(history[history.length - 1].date)}`;
  }, [hasRealHistory, history, status]);

  return (
    <section className="rmi-card p-4 shadow-market sm:p-5">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black">Chart</h2>
          <p className="mt-1 text-sm font-bold text-paper/50">{subtitle}</p>
        </div>
        <div className="inline-flex max-w-full overflow-x-auto rounded-lg border border-line bg-panelSoft p-1 scrollbar-thin">
          {ranges.map((candidate) => (
            <button
              key={candidate}
              type="button"
              onClick={() => setRange(candidate)}
              className={clsx(
                "h-8 min-w-11 rounded px-2 text-xs font-black transition",
                range === candidate
                  ? "bg-cyan text-white"
                  : "text-paper/50 hover:bg-panel hover:text-paper"
              )}
            >
              {candidate}
            </button>
          ))}
        </div>
      </div>
      <PriceChart data={history} height={320} />
      <p className="mt-2 text-xs text-paper/42">Hover, tap, or click the chart to inspect a recorded quote.</p>
      {status === "error" ? (
        <p className="mt-3 text-xs font-bold text-ember">Price history unavailable.</p>
      ) : null}
    </section>
  );
}
