import { clamp } from "@/lib/pricing";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
import type {
  AdapterSignal,
  AdapterSignals,
  ArtistExternalIds,
  MarketObservation,
  ObservationBaselines
} from "@/server/market/market-data";
import type { HypeStats } from "@/lib/types";

type YoutubeCollectOptions = {
  artists: MarketUpdateArtist[];
  runDate: string;
  apiKey?: string;
  externalIds?: Record<string, ArtistExternalIds>;
  baselines?: ObservationBaselines;
  delayMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type YoutubeChannelInfo = {
  requestedChannelId: string;
  id: string;
  title?: string;
  url: string;
  viewCount?: number;
  subscriberCount?: number;
  hiddenSubscriberCount?: boolean;
  videoCount?: number;
};

type YoutubeChannelResource = {
  id?: string;
  snippet?: {
    title?: string;
    customUrl?: string;
  };
  statistics?: {
    viewCount?: string;
    subscriberCount?: string;
    hiddenSubscriberCount?: boolean;
    videoCount?: string;
  };
};

type YoutubeChannelListResponse = {
  items?: YoutubeChannelResource[];
  error?: {
    message?: string;
  };
};

export type YoutubeMarketSignals = {
  signals: AdapterSignals;
  observations: MarketObservation[];
  warnings: string[];
};

const SOURCE = "youtube";
const CHANNEL_VIEWS = "channel_views";
const SUBSCRIBERS = "subscriber_count";
const VIDEO_COUNT = "video_count";
const REQUEST_ERROR = "request_error";
const MAX_CHANNELS_PER_REQUEST = 50;

export async function collectYoutubeMarketSignals({
  artists,
  runDate,
  apiKey,
  externalIds = {},
  baselines = {},
  delayMs = 250,
  timeoutMs = 10000,
  fetchImpl = fetch
}: YoutubeCollectOptions): Promise<YoutubeMarketSignals> {
  const cleanApiKey = apiKey?.trim();

  if (!cleanApiKey) {
    return {
      signals: {},
      observations: [],
      warnings: ["YOUTUBE_API_KEY is not configured; skipped YouTube channel signals."]
    };
  }

  const signals: AdapterSignals = {};
  const observations: MarketObservation[] = [];
  const channelLookups = artists.flatMap((artist) => {
    const channelId = normalizeYoutubeChannelId(externalIds[artist.id]?.youtubeChannelId);

    if (!channelId) {
      signals[artist.id] = {
        stats: {},
        rawPayload: {
          source: SOURCE,
          status: "missing_external_id",
          note: "No youtube_channel_id is configured for this artist."
        }
      };
      return [];
    }

    return [
      {
        artist,
        channelId
      }
    ];
  });

  for (const [index, chunk] of chunkItems(channelLookups, MAX_CHANNELS_PER_REQUEST).entries()) {
    if (index > 0 && delayMs > 0) {
      await sleep(delayMs);
    }

    const result = await fetchYoutubeChannels({
      apiKey: cleanApiKey,
      channelIds: chunk.map((item) => item.channelId),
      timeoutMs,
      fetchImpl
    });

    if (!result.ok) {
      for (const item of chunk) {
        signals[item.artist.id] = {
          stats: {},
          rawPayload: {
            source: SOURCE,
            requestedChannelId: item.channelId,
            status: "error",
            error: result.error
          }
        };
        observations.push({
          artistId: item.artist.id,
          source: SOURCE,
          metric: REQUEST_ERROR,
          observedDate: runDate,
          value: 1,
          unit: "flag",
          rawPayload: {
            requestedChannelId: item.channelId,
            error: result.error
          }
        });
      }
      continue;
    }

    for (const item of chunk) {
      const info = result.channels[item.channelId];

      if (!info) {
        signals[item.artist.id] = {
          stats: {},
          rawPayload: {
            source: SOURCE,
            requestedChannelId: item.channelId,
            status: "not_found"
          }
        };
        observations.push({
          artistId: item.artist.id,
          source: SOURCE,
          metric: REQUEST_ERROR,
          observedDate: runDate,
          value: 1,
          unit: "flag",
          rawPayload: {
            requestedChannelId: item.channelId,
            error: "YouTube channel was not found."
          }
        });
        continue;
      }

      const signal = buildYoutubeSignal({
        artist: item.artist,
        info,
        runDate,
        baseline: baselines[item.artist.id] ?? {}
      });

      signals[item.artist.id] = signal.signal;
      observations.push(...signal.observations);
    }
  }

  return {
    signals,
    observations,
    warnings:
      channelLookups.length === artists.length
        ? []
        : [`YouTube skipped ${artists.length - channelLookups.length} artist(s) without youtube_channel_id.`]
  };
}

function buildYoutubeSignal({
  artist,
  info,
  runDate,
  baseline
}: {
  artist: MarketUpdateArtist;
  info: YoutubeChannelInfo;
  runDate: string;
  baseline: Record<string, number>;
}): {
  signal: AdapterSignal;
  observations: MarketObservation[];
} {
  const viewMomentum = calculateCumulativeMomentum(info.viewCount, baseline[CHANNEL_VIEWS], 5.25, -25, 70);
  const subscriberMomentum = calculateCumulativeMomentum(info.subscriberCount, baseline[SUBSCRIBERS], 4.5, -20, 65);
  const uploadMomentum = calculateUploadMomentum(info.videoCount, baseline[VIDEO_COUNT]);
  const stats: Partial<HypeStats> = {};

  if (
    typeof viewMomentum === "number" ||
    typeof subscriberMomentum === "number" ||
    typeof uploadMomentum === "number"
  ) {
    const youtubeGrowth = weightedAverage([
      { value: viewMomentum, weight: 0.72 },
      { value: subscriberMomentum, weight: 0.18 },
      { value: uploadMomentum, weight: 0.1 }
    ]);
    const socialGrowth = weightedAverage([
      { value: subscriberMomentum, weight: 0.75 },
      { value: viewMomentum, weight: 0.2 }
    ]);

    if (typeof youtubeGrowth === "number") {
      stats.youtubeGrowth = clamp(youtubeGrowth, -25, 70);
    }

    if (typeof socialGrowth === "number") {
      stats.socialGrowth = clamp(socialGrowth, -35, 120);
    }

    stats.newsScore = clamp(
      50 + (viewMomentum ?? 0) * 0.06 + (subscriberMomentum ?? 0) * 0.04 + Math.max(0, uploadMomentum ?? 0) * 0.35,
      0,
      100
    );
  }

  const rawPayload = {
    source: SOURCE,
    runDate,
    requestedChannelId: info.requestedChannelId,
    channelId: info.id,
    title: info.title ?? null,
    url: info.url,
    viewCount: info.viewCount ?? null,
    subscriberCount: info.subscriberCount ?? null,
    hiddenSubscriberCount: info.hiddenSubscriberCount ?? null,
    videoCount: info.videoCount ?? null,
    baselineViewCount: baseline[CHANNEL_VIEWS] ?? null,
    baselineSubscriberCount: baseline[SUBSCRIBERS] ?? null,
    baselineVideoCount: baseline[VIDEO_COUNT] ?? null,
    viewMomentum,
    subscriberMomentum,
    uploadMomentum,
    status: Object.keys(stats).length ? "ok" : "baseline_only"
  };
  const observations: MarketObservation[] = [];

  if (typeof info.viewCount === "number") {
    observations.push(createObservation(artist.id, runDate, CHANNEL_VIEWS, info.viewCount, "views", rawPayload));
  }

  if (typeof info.subscriberCount === "number") {
    observations.push(createObservation(artist.id, runDate, SUBSCRIBERS, info.subscriberCount, "subscribers", rawPayload));
  }

  if (typeof info.videoCount === "number") {
    observations.push(createObservation(artist.id, runDate, VIDEO_COUNT, info.videoCount, "videos", rawPayload));
  }

  return {
    signal: {
      stats,
      confidence: 0.84,
      rawPayload
    },
    observations
  };
}

async function fetchYoutubeChannels({
  apiKey,
  channelIds,
  timeoutMs,
  fetchImpl
}: {
  apiKey: string;
  channelIds: string[];
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<{ ok: true; channels: Record<string, YoutubeChannelInfo> } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = new URL("https://www.googleapis.com/youtube/v3/channels");

  url.searchParams.set("part", "snippet,statistics");
  url.searchParams.set("id", channelIds.join(","));
  url.searchParams.set("key", apiKey);

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal
    });
    const text = await response.text();
    const parsed = tryParseJson(text) as YoutubeChannelListResponse | null;

    if (!response.ok) {
      return {
        ok: false,
        error: parsed?.error?.message ?? `YouTube request failed with ${response.status}.`
      };
    }

    if (!parsed) {
      return {
        ok: false,
        error: text.slice(0, 220) || "YouTube returned a non-JSON response."
      };
    }

    return {
      ok: true,
      channels: Object.fromEntries(
        (parsed.items ?? [])
          .map((item) => parseYoutubeChannel(item))
          .filter((item): item is YoutubeChannelInfo => Boolean(item))
          .map((item) => [item.requestedChannelId, item])
      )
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "YouTube request failed."
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseYoutubeChannel(value: YoutubeChannelResource): YoutubeChannelInfo | null {
  if (!value.id) {
    return null;
  }

  return {
    requestedChannelId: value.id,
    id: value.id,
    title: value.snippet?.title,
    url: `https://www.youtube.com/channel/${value.id}`,
    viewCount: getInteger(value.statistics?.viewCount),
    subscriberCount: value.statistics?.hiddenSubscriberCount ? undefined : getInteger(value.statistics?.subscriberCount),
    hiddenSubscriberCount: value.statistics?.hiddenSubscriberCount,
    videoCount: getInteger(value.statistics?.videoCount)
  };
}

function createObservation(
  artistId: string,
  observedDate: string,
  metric: string,
  value: number,
  unit: string,
  rawPayload: Record<string, unknown>
): MarketObservation {
  return {
    artistId,
    source: SOURCE,
    metric,
    observedDate,
    value,
    unit,
    rawPayload
  };
}

function normalizeYoutubeChannelId(value: string | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  const channelPathMatch = trimmed.match(/(?:youtube\.com\/channel\/)(UC[\w-]+)/i);

  if (channelPathMatch?.[1]) {
    return channelPathMatch[1];
  }

  if (/^UC[\w-]{20,}$/.test(trimmed)) {
    return trimmed;
  }

  return undefined;
}

function calculateCumulativeMomentum(
  current: number | undefined,
  baseline: number | undefined,
  multiplier: number,
  min: number,
  max: number
) {
  if (typeof current !== "number" || typeof baseline !== "number" || baseline <= 0) {
    return undefined;
  }

  return clamp(((current - baseline) / baseline) * 100 * multiplier, min, max);
}

function calculateUploadMomentum(current: number | undefined, baseline: number | undefined) {
  if (typeof current !== "number" || typeof baseline !== "number") {
    return undefined;
  }

  return clamp(Math.max(0, current - baseline) * 18, 0, 45);
}

function weightedAverage(values: Array<{ value?: number; weight: number }>) {
  const validValues = values.filter((item): item is { value: number; weight: number } => typeof item.value === "number");
  const totalWeight = validValues.reduce((total, item) => total + item.weight, 0);

  if (!validValues.length || totalWeight <= 0) {
    return undefined;
  }

  return validValues.reduce((total, item) => total + item.value * item.weight, 0) / totalWeight;
}

function getInteger(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function chunkItems<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
