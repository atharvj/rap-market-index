"use client";

import { createLatestRequest } from "@/lib/latest-request";
import { formatCompact, formatDate } from "@/lib/formatters";
import { MARKET_OBSERVATION_REFRESH_MS } from "@/lib/refresh-policy";
import type { MarketObservationSeries } from "@/lib/types";
import { useEffect, useMemo, useState } from "react";

type ObservationsResponse = {
  ok: boolean;
  series?: MarketObservationSeries[];
};

const preferredSeries = [
  { key: "spotify_public:monthly_listeners", label: "Spotify Monthly Listeners" },
  { key: "youtube:subscriber_count", label: "YouTube Subscribers · Total" },
  { key: "youtube:channel_views", label: "YouTube Views · Lifetime" },
  { key: "wikimedia:pageviews_7d", label: "Wikipedia Attention · 7D" },
  { key: "apple_charts:chart_points", label: "Apple Song Chart Points" },
  { key: "apple_charts:album_chart_points", label: "Apple Album Chart Points" },
  { key: "media_rss:source_count", label: "Media Sources · 30D" },
  { key: "trade_flow:unique_trader_count", label: "Active Traders · 24H" },
  { key: "trade_flow:trade_count", label: "Orders · 24H" },
  { key: "youtube_comments:positive_comment_share", label: "Sampled Positive Reactions" },
  { key: "youtube_comments:negative_comment_share", label: "Sampled Negative Reactions" },
  { key: "youtube_comments:comment_count", label: "Recent Comments Sampled" },
  { key: "bluesky:reaction_count", label: "Social Reactions Sampled" },
  { key: "bluesky:reaction_sentiment", label: "Sampled Social Sentiment" }
];

export function ArtistAudienceSnapshot({ artistId }: { artistId: string }) {
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [series, setSeries] = useState<MarketObservationSeries[]>([]);

  useEffect(() => {
    const requests = createLatestRequest();
    setSeries([]);
    setRefreshFailed(false);

    const loadObservations = () => {
      const request = requests.start();
      return fetch(`/api/market/observations/${artistId}?range=1M`, { signal: request.signal })
        .then(async response => {
          if (!response.ok) throw new Error("Market indicators unavailable.");
          return response.json() as Promise<ObservationsResponse>;
        })
        .then(payload => {
          if (!request.isCurrent()) return;
          if (!payload.ok || !Array.isArray(payload.series)) throw new Error("Market indicators unavailable.");
          setSeries(payload.series);
          setRefreshFailed(false);
        })
        .catch(() => { if (request.isCurrent()) setRefreshFailed(true); })
        .finally(request.finish);
    };

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
      requests.dispose();
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
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [series]);

  if (!metrics.length && !refreshFailed) {
    return null;
  }

  return (
    <section className="rmi-card overflow-hidden">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-base font-semibold">Public Market Indicators</h2>
        <p className="mt-1 text-xs text-paper/48">High-level audience, attention, media, and trading context. No single indicator sets the quote.</p>
      </div>
      {refreshFailed ? <p className="px-4 py-3 text-xs text-ember" role="status">{metrics.length ? "Latest refresh failed. Showing the last loaded indicators." : "Market indicators are temporarily unavailable."}</p> : null}
      <div
        className="grid divide-x divide-y divide-line"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}
      >
        {metrics.map((metric) => (
          <div key={metric.key} className="min-w-0 px-3 py-3">
            <p className="truncate text-[10px] font-semibold uppercase text-paper/42">{metric.label}</p>
            <p className="mt-1 text-sm font-semibold number-tabular">{metric.key.endsWith("_comment_share") ? `${metric.value.toFixed(1)}%` : metric.key === "bluesky:reaction_sentiment" ? `${metric.value > 0 ? "+" : ""}${metric.value.toFixed(1)} / 100` : formatCompact(metric.value)}</p>
            <p className="mt-1 text-[10px] text-paper/35">Updated {formatDate(metric.date)}</p>
          </div>
        ))}
      </div>
      {metrics.some(metric => metric.key.startsWith("youtube_comments:")) ? <p className="border-t border-line px-4 py-3 text-xs text-paper/48">Reactions come from a limited sample of recent YouTube comments, not all fans. Unclassified comments are included in the sample count. Listening and touring can remain strong despite negative reactions.</p> : null}
      {metrics.some(metric => metric.key.startsWith("bluesky:")) ? <p className="border-t border-line px-4 py-3 text-xs text-paper/48">Social sentiment samples identifiable reactions, not all fans. Scores range from −100 to +100. Announcements without an opinion do not count as approval.</p> : null}
      {metrics.some(metric => metric.key.startsWith("apple_charts:")) ? <p className="border-t border-line px-4 py-3 text-xs text-paper/48">Chart points summarize US, UK, and Canada rank positions, not stream counts. Song and album charts share one provider.</p> : null}
    </section>
  );
}
