"use client";

import { createLatestRequest } from "@/lib/latest-request";
import { formatCompact, formatDate } from "@/lib/formatters";
import { MARKET_OBSERVATION_REFRESH_MS } from "@/lib/refresh-policy";
import { readPublicIndicator, readPublicReception, type PublicIndicatorValue } from "@/lib/public-market-indicators";
import type { MarketObservationSeries } from "@/lib/types";
import { useEffect, useMemo, useState } from "react";

type ObservationsResponse = {
  ok: boolean;
  series?: MarketObservationSeries[];
};

const indicatorGroups = [
  { title: "Audience & attention", metrics: [
    ["spotify_public:monthly_listeners", "Spotify Monthly Listeners"],
    ["youtube:subscriber_count", "YouTube Subscribers · Total"],
    ["youtube:channel_views", "YouTube Views · Lifetime"],
    ["lastfm:listeners", "Last.fm Listeners · Total"],
    ["lastfm:playcount", "Last.fm Plays · Lifetime"],
    ["wikimedia:pageviews_7d", "Wikipedia Attention · 7D"]
  ] },
  { title: "Charts & media", metrics: [
    ["apple_charts:chart_points", "Apple Song Chart Points"],
    ["apple_charts:album_chart_points", "Apple Album Chart Points"],
    ["media_rss:source_count", "Media Sources · 30D"]
  ] },
  { title: "Trading activity", metrics: [
    ["trade_flow:unique_trader_count", "Active Traders · 24H"],
    ["trade_flow:trade_count", "Orders · 24H"]
  ] }
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

  const groups = useMemo(() => indicatorGroups.map(group => ({ ...group,
    metrics: group.metrics.flatMap(([key, label]) => {
      const item = readPublicIndicator(series, key);
      return item ? [{ key, label, ...item }] : [];
    })
  })).filter(group => group.metrics.length), [series]);
  const youtube = readPublicReception(series, "youtube_comments");
  const social = readPublicReception(series, "bluesky");
  if (!groups.length && !youtube && !social && !refreshFailed) return null;

  return (
    <section className="rmi-card overflow-hidden" aria-label="Public Market Indicators">
      <div className="border-b border-line px-4 py-4 sm:px-5">
        <h2 className="text-base font-semibold">Public Market Indicators</h2>
        <p className="mt-1 text-xs leading-relaxed text-paper/65">Audience, attention and reception from public sources. No single indicator sets the quote.</p>
      </div>
      {refreshFailed ? <p className="px-4 py-3 text-xs text-ember" role="status">{groups.length || youtube || social ? "Latest refresh failed. Showing the last loaded indicators." : "Market indicators are temporarily unavailable."}</p> : null}
      {groups.map(group => (
        <div key={group.title} className="border-b border-line last:border-b-0">
          <h3 className="px-4 pb-2 pt-4 text-xs font-semibold text-paper/70 sm:px-5">{group.title}</h3>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 px-4 pb-4 min-[420px]:grid-cols-2 sm:px-5 xl:grid-cols-3">
            {group.metrics.map(metric => <Indicator key={metric.key} label={metric.label} item={metric} />)}
          </dl>
          {group.title === "Charts & media" && group.metrics.some(metric => metric.key.startsWith("apple_charts:")) ?
            <p className="px-4 pb-4 text-xs leading-relaxed text-paper/60 sm:px-5">Chart points summarize US, UK and Canada ranks, not stream counts. Song and album charts share one provider.</p> : null}
        </div>
      ))}
      {youtube || social ? (
        <div className="px-4 py-4 sm:px-5">
          <h3 className="text-xs font-semibold text-paper/70">Fan reaction samples</h3>
          <div className={`mt-3 grid gap-4 ${youtube && social ? "lg:grid-cols-2" : ""}`}>
            {youtube ? <article aria-label="YouTube reception" className="min-w-0 rounded border border-line p-4">
              <h4 className="text-sm font-semibold">YouTube comments</h4>
              <p className="mt-1 text-xs text-paper/60">As of {formatDate(youtube.date)}</p>
              {youtube.available ? <dl className="mt-4 grid grid-cols-2 gap-4">
                {youtube.positive !== null ? <ReactionValue label="Sampled Positive Reactions" value={`${youtube.positive.toFixed(1)}%`} /> : null}
                {youtube.negative !== null ? <ReactionValue label="Sampled Negative Reactions" value={`${youtube.negative.toFixed(1)}%`} /> : null}
              </dl> : <p className="mt-3 text-sm text-paper/70">Reception estimate insufficient or unavailable.</p>}
              <dl className="mt-4 grid grid-cols-2 gap-4">
                <ReactionValue label="Recent Comments Sampled" value={youtube.count === null ? "—" : formatCompact(youtube.count)} />
                <ReactionValue label="Identifiable YouTube Reactions" value={youtube.classifiedCount === null ? "—" : formatCompact(youtube.classifiedCount)} />
              </dl>
              <p className="mt-4 text-xs leading-relaxed text-paper/60">A limited sample, not all fans. Percentages include unclassified comments in the denominator.</p>
              {(youtube.catalogueCount ?? 0) > 0 ? <p className="mt-2 text-xs leading-relaxed text-paper/60">Includes comments on older official recordings; these may concern those songs rather than the latest album.</p> : null}
            </article> : null}
            {social ? <article aria-label="Social reception" className="min-w-0 rounded border border-line p-4">
              <h4 className="text-sm font-semibold">Bluesky reactions</h4>
              <p className="mt-1 text-xs text-paper/60">As of {formatDate(social.date)}</p>
              <dl className="mt-4 grid grid-cols-2 gap-4">
                <ReactionValue label="Social Reactions Sampled" value={social.count === null ? "—" : formatCompact(social.count)} />
                <ReactionValue label="Sampled Social Sentiment" value={social.score === null ? "Not enough data" : `${social.score > 0 ? "+" : ""}${social.score.toFixed(1)} / 100`} />
              </dl>
              <p className="mt-4 text-xs leading-relaxed text-paper/60">{social.count === 0 ? "No identifiable reactions in this sample. " : ""}Scores range from −100 to +100 and sample identifiable reactions, not all fans. Announcements without an opinion do not count as approval.</p>
            </article> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Indicator({ label, item }: { label: string; item: PublicIndicatorValue }) {
  return <div className="min-w-0">
    <dt className="break-words text-xs leading-relaxed text-paper/70">{label}</dt>
    <dd className="mt-1 text-lg font-semibold number-tabular">{formatCompact(item.value)}</dd>
    <dd className="mt-1 text-xs text-paper/55">As of {formatDate(item.date)}</dd>
  </div>;
}

function ReactionValue({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0">
    <dt className="break-words text-xs leading-relaxed text-paper/70">{label}</dt>
    <dd className="mt-1 text-base font-semibold number-tabular">{value}</dd>
  </div>;
}
