"use client";

import { formatCompact, formatDate } from "@/lib/formatters";
import { MARKET_OBSERVATION_REFRESH_MS } from "@/lib/refresh-policy";
import type { MarketObservationSeries } from "@/lib/types";
import { useEffect, useMemo, useState } from "react";

type ObservationsResponse = {
  ok: boolean;
  series?: MarketObservationSeries[];
};

const preferredSeries = [
  { key: "youtube:subscriber_count", label: "YouTube Subscribers · Total" },
  { key: "youtube:channel_views", label: "YouTube Views · Lifetime" },
  { key: "wikimedia:pageviews_7d", label: "Wikipedia Views · 7D" },
  { key: "media_rss:source_count", label: "Media Sources · 30D" },
  { key: "trade_flow:unique_trader_count", label: "Active Traders · 24H" },
  { key: "trade_flow:trade_count", label: "Orders · 24H" }
];

export function ArtistAudienceSnapshot({ artistId }: { artistId: string }) {
  const [series, setSeries] = useState<MarketObservationSeries[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    const loadObservations = () => fetch(`/api/market/observations/${artistId}?range=1M`, { signal: controller.signal })
      .then((response) => response.json() as Promise<ObservationsResponse>)
      .then((payload) => {
        if (payload.ok && payload.series) {
          setSeries(payload.series);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSeries([]);
        }
      });

    void loadObservations();

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadObservations();
      }
    }, MARKET_OBSERVATION_REFRESH_MS);
    const refreshVisibleObservations = () => {
      if (document.visibilityState === "visible") {
        void loadObservations();
      }
    };
    window.addEventListener("focus", refreshVisibleObservations);
    document.addEventListener("visibilitychange", refreshVisibleObservations);

    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVisibleObservations);
      document.removeEventListener("visibilitychange", refreshVisibleObservations);
    };
  }, [artistId]);

  const metrics = useMemo(() => {
    const byKey = new Map(series.map((item) => [item.key, item]));

    return preferredSeries
      .map((definition) => {
        const item = byKey.get(definition.key);

        if (!item || item.latestValue === null || !item.latestDate) {
          return null;
        }

        return {
          ...definition,
          value: item.latestValue,
          date: item.latestDate
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .slice(0, 6);
  }, [series]);

  if (!metrics.length) {
    return null;
  }

  return (
    <section className="rmi-card overflow-hidden">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-base font-semibold">Public Market Indicators</h2>
        <p className="mt-1 text-xs text-paper/48">High-level audience, attention, media, and trading context. No single indicator sets the quote.</p>
      </div>
      <div
        className="grid divide-x divide-y divide-line"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}
      >
        {metrics.map((metric) => (
          <div key={metric.key} className="min-w-0 px-3 py-3">
            <p className="truncate text-[10px] font-semibold uppercase text-paper/42">{metric.label}</p>
            <p className="mt-1 text-sm font-semibold number-tabular">{formatCompact(metric.value)}</p>
            <p className="mt-1 text-[10px] text-paper/35">Updated {formatDate(metric.date)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
