import { clamp } from "@/lib/pricing";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
import type { AdapterSignals, MarketEvent, MarketObservation, ObservationBaselines } from "@/server/market/market-data";
import { getYoutubeVideoId, isWatchNowMarketEvent } from "@/server/market/watch-now-videos";
import { expandRecordingEvents, isOfficialRecordingSource } from "@/server/market/recording-credits";
import { calculateRateMomentum, getBaselineAgeDays } from "@/server/market/source-quality";

export function selectTrackedVideos(events: Record<string, MarketEvent[]>, artists: MarketUpdateArtist[]) {
  const expanded = expandRecordingEvents(events, artists);
  return Object.fromEntries(artists.map(artist => [artist.id, (expanded[artist.id] ?? [])
    .filter(event => (isOfficialRecordingSource(event.rawPayload) && Number(event.rawPayload.durationSeconds) > 75 && Boolean(getYoutubeVideoId(event.rawPayload, event.sourceUrl ?? null))) ||
      (event.rawPayload.classificationReason === "editorial_performance" && isWatchNowMarketEvent({ title: event.title, source_url: event.sourceUrl ?? null, raw_payload: event.rawPayload })))
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate))
    .filter((event, index, all) => all.findIndex(other => other.sourceUrl === event.sourceUrl) === index).slice(0, 4)
  ]));
}

export function getTrackedVideoMetrics(events: Record<string, MarketEvent[]>) {
  return [...new Set(Object.values(events).flat().map(event => getYoutubeVideoId(event.rawPayload, event.sourceUrl ?? null)).filter(Boolean))].map(id => `views_${id}`);
}

export async function collectYoutubeTrackSignals({ artists, events, runDate, apiKey, baselines = {}, fetchImpl = fetch }: {
  artists: MarketUpdateArtist[]; events: Record<string, MarketEvent[]>; runDate: string; apiKey?: string;
  baselines?: ObservationBaselines; fetchImpl?: typeof fetch;
}) {
  const signals: AdapterSignals = {}, observations: MarketObservation[] = [], warnings: string[] = [];
  if (!apiKey) return { signals, observations, warnings: ["YouTube track metrics require YOUTUBE_API_KEY."] };
  const ids = getTrackedVideoMetrics(events).map(metric => metric.slice(6));
  const videos = new Map<string, { id: string; snippet?: { channelId?: string }; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }>();
  for (let offset = 0; offset < ids.length; offset += 50) {
    try {
      const url = new URL("https://www.googleapis.com/youtube/v3/videos");
      url.search = new URLSearchParams({ part: "snippet,statistics", id: ids.slice(offset, offset + 50).join(","), key: apiKey }).toString();
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload.items)) throw new Error("Missing video results");
      for (const video of payload.items) if (ids.includes(video.id)) videos.set(video.id, video);
    } catch (error) { warnings.push(`YouTube song metrics unavailable: ${error instanceof Error ? error.message : "request failed"}`); }
  }
  for (const artist of artists) {
    const deltas: Array<{ value: number; weight: number; confidence: number }> = [];
    const metrics: Array<Record<string, unknown>> = [];
    for (const event of events[artist.id] ?? []) {
      const id = getYoutubeVideoId(event.rawPayload, event.sourceUrl ?? null);
      if (!id) continue;
      const video = videos.get(id);
      const views = Number(video?.statistics?.viewCount);
      if (!video || !Number.isSafeInteger(views) || views < 0 || !video.snippet?.channelId || video.snippet.channelId !== (event.rawPayload.videoChannelId || event.rawPayload.channelId)) continue;
      const metric = `views_${id}`, baseline = baselines[artist.id] ?? {};
      const old = baseline[metric];
      // A reset/deletion is not audience rejection. A first observation cannot
      // reveal acceleration, so it seeds a baseline without moving the quote.
      if (typeof old === "number" && views < old) continue;
      const rate = calculateRateMomentum({ current: views, baseline: old, baselineAgeDays: getBaselineAgeDays(baseline, metric),
        recentDailyRate: baseline[`${metric}__recent_daily_rate`], recentRateSamples: baseline[`${metric}__recent_rate_samples`],
        latestCompletedDailyRate: baseline[`${metric}__latest_completed_daily_rate`], useCompletedIntervalFallback: true,
        multiplier: 0.18, min: -25, max: 40 });
      if (typeof rate.value === "number") deltas.push({ value: rate.value, weight: Math.log10(Math.max(10, views)), confidence: rate.confidenceMultiplier });
      const raw = { source: "youtube_tracks", runDate, videoId: id, channelId: video.snippet.channelId, title: event.title,
        views, likes: readCounter(video.statistics?.likeCount), comments: readCounter(video.statistics?.commentCount),
        recentDailyRate: rate.recentDailyRate ?? null, currentDailyRate: rate.currentDailyRate ?? null,
        momentum: rate.value ?? null, rateQuality: rate, status: typeof rate.value === "number" ? "ok" : "baseline_only" };
      metrics.push(raw);
      observations.push({ artistId: artist.id, source: "youtube_tracks", metric, observedDate: runDate,
        observedAt: new Date().toISOString(), value: views, unit: "views", rawPayload: raw });
    }
    if (!metrics.length) continue;
    const weight = deltas.reduce((sum, item) => sum + item.weight, 0);
    signals[artist.id] = { stats: weight ? { youtubeGrowth: clamp(deltas.reduce((sum, item) => sum + item.value * item.weight, 0) / weight, -25, 40) } : {},
      confidence: weight ? 0.78 * deltas.reduce((sum, item) => sum + item.confidence * item.weight, 0) / weight : 0.78,
      rawPayload: { source: "youtube_tracks", runDate, status: weight ? "ok" : "baseline_only", videos: metrics } };
  }
  return { signals, observations, warnings };
}

function readCounter(value: string | undefined) {
  if (value === undefined) return null;
  const counter = Number(value);
  return Number.isSafeInteger(counter) && counter >= 0 ? counter : null;
}
