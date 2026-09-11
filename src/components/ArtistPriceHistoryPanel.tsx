"use client";

import { PriceChart } from "@/components/PriceChart";
import { formatDate } from "@/lib/formatters";
import { MARKET_CONTENT_REFRESH_MS } from "@/lib/refresh-policy";
import type { PricePoint } from "@/lib/types";
import { hasPriceMovement } from "@/lib/price-series";
import { originalPriceHistory } from "@/lib/adjusted-price-history";
import clsx from "clsx";
import { Activity, Crosshair } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type HistoryRange = "1D" | "7D" | "1M" | "3M" | "6M" | "1Y" | "ALL";

type HistoryResponse = {
  ok: boolean;
  error?: string;
  range?: HistoryRange;
  points?: PricePoint[];
  hasRealHistory?: boolean;
  recordedCloseCount?: number;
  hasMovement?: boolean;
  granularity?: "intraday" | "daily";
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
  const [recordedCloseCount, setRecordedCloseCount] = useState(fallbackData.length);
  const [granularity, setGranularity] = useState<"intraday" | "daily">("daily");
  const [originalQuotes, setOriginalQuotes] = useState(false);
  const hasAdjustment = history.some(point => point.recordedPrice !== undefined);
  const displayedHistory = originalQuotes ? originalPriceHistory(history) : history;
  const hasMovement = hasPriceMovement(displayedHistory);

  useEffect(() => {
    const controller = new AbortController();

    setStatus("loading");

    const loadHistory = () => fetch(`/api/market/history/${artistId}?range=${range}`, {
      signal: controller.signal
    })
      .then((response) => response.json() as Promise<HistoryResponse>)
      .then((payload) => {
        if (!payload.ok || !payload.points) {
          throw new Error(payload.error ?? "Could not load price history.");
        }

        setHistory(payload.points);
        setHasRealHistory(Boolean(payload.hasRealHistory));
        setRecordedCloseCount(payload.recordedCloseCount ?? payload.points.length);
        setGranularity(payload.granularity === "intraday" ? "intraday" : "daily");
        setStatus("ready");
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }

        setHistory(fallbackData);
        setHasRealHistory(false);
        setRecordedCloseCount(fallbackData.length);
        setGranularity("daily");
        setStatus(error instanceof Error ? "error" : "error");
      });

    void loadHistory();

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadHistory();
      }
    }, MARKET_CONTENT_REFRESH_MS);
    const refreshVisibleHistory = () => {
      if (document.visibilityState === "visible") {
        void loadHistory();
      }
    };
    window.addEventListener("focus", refreshVisibleHistory);
    document.addEventListener("visibilitychange", refreshVisibleHistory);

    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVisibleHistory);
      document.removeEventListener("visibilitychange", refreshVisibleHistory);
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
    <section className="rmi-card overflow-hidden" aria-busy={status === "loading"}>
      <div className="rmi-section-header flex flex-col items-stretch justify-between gap-3 px-4 py-4 text-left sm:flex-row sm:items-center sm:px-5">
        <div className="min-w-0 text-left sm:mr-auto">
          <div className="flex flex-wrap items-center gap-2">
            <Activity className="h-4 w-4 text-cyan" aria-hidden="true" />
            <h2 className="text-lg font-semibold">Price History</h2>
            <span className="rmi-status-chip"><Crosshair className="h-3 w-3" /> {hasAdjustment && !originalQuotes ? "Adjusted history" : "Recorded quotes"}</span>
          </div>
          <p className="mt-1 text-sm text-paper/50">{subtitle}</p>
        </div>
        <div className="inline-flex max-w-full overflow-x-auto rounded-[var(--radius-control)] border border-line bg-panelSoft p-1 scrollbar-thin">
          {ranges.map((candidate) => (
            <button
              key={candidate}
              type="button"
              onClick={() => setRange(candidate)}
              className={clsx(
                "h-8 min-w-11 rounded-[calc(var(--radius-control)-2px)] px-2 text-xs font-semibold transition",
                range === candidate
                  ? "bg-cyan text-ink"
                  : "text-paper/50 hover:bg-cyan/10 hover:text-cyan"
              )}
              aria-pressed={range === candidate}
            >
              {candidate}
            </button>
          ))}
        </div>
      </div>
      <div className="p-4 sm:p-5">
        {hasAdjustment ? <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-xl text-xs text-paper/55">{originalQuotes ? "Showing original recorded prices, including the valuation change." : "Earlier prices are shown on today’s price scale so the valuation change does not hide their movement. Original quotes are preserved."}</p>
          <div className="flex gap-1 rounded-[var(--radius-control)] border border-line p-1">
            {[{ original: false, label: "Adjusted" }, { original: true, label: "Original quotes" }].map(option => <button
              key={option.label} type="button" aria-pressed={originalQuotes === option.original}
              onClick={() => setOriginalQuotes(option.original)}
              className={clsx("rounded px-2 py-1 text-xs font-semibold", originalQuotes === option.original ? "bg-cyan text-ink" : "text-paper/60 hover:text-cyan")}
            >{option.label}</button>)}
          </div>
        </div> : null}
        <div className="rmi-chart-shell p-2 sm:p-3"><PriceChart data={displayedHistory} height={290} timeScale={granularity} quoteLabel={hasAdjustment && !originalQuotes ? "Adjusted quote" : "Recorded quote"} /></div>
        <p className="mt-3 text-xs text-paper/42">
          {status === "loading"
            ? "Loading recorded market quotes."
            : status === "ready" && !hasMovement
            ? range === "1D"
              ? "No intraday market-quote movement yet. Individual order fills are not charted."
              : "No additional recorded close or eligible trade quote in this range."
            : range === "1D"
              ? "The 1D view shows recorded market quotes, not individual order fills. Hover, tap, or click to inspect one."
              : `${recordedCloseCount} recorded daily close${recordedCloseCount === 1 ? "" : "s"} in this range. The chart shows market quotes, not individual order fills.`}
        </p>
        {status === "error" ? (
          <p className="mt-3 text-xs font-bold text-ember">Price history unavailable.</p>
        ) : null}
      </div>
    </section>
  );
}
