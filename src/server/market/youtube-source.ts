import { clamp } from "@/lib/pricing";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
import type {
  AdapterSignal,
  AdapterSignals,
  ArtistExternalIds,
  MarketObservation,
  ObservationBaselines
} from "@/server/market/market-data";
import {
  buildMomentumQualityPayload,
  calculatePointDeltaMomentum,
  calculateSnapshotMomentum,
  getBaselineAgeDays,
  getCombinedConfidenceMultiplier
} from "@/server/market/source-quality";
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
        : [`YouTube skipped missing channel IDs for: ${formatMissingArtistNames({ artists, channelLookups })}.`]
  };
}

function formatMissingArtistNames({
  artists,
  channelLookups
}: {
  artists: MarketUpdateArtist[];
  channelLookups: Array<{ artist: MarketUpdateArtist }>;
}) {
  const mappedIds = new Set(channelLookups.map((lookup) => lookup.artist.id));
  return artists
    .filter((artist) => !mappedIds.has(artist.id))
    .map((artist) => `${artist.name} (${artist.ticker})`)
    .join(", ");
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
  const viewBaselineAgeDays = getBaselineAgeDays(baseline, CHANNEL_VIEWS);
  const subscriberBaselineAgeDays = getBaselineAgeDays(baseline, SUBSCRIBERS);
  const videoBaselineAgeDays = getBaselineAgeDays(baseline, VIDEO_COUNT);
  const viewMomentum = calculateSnapshotMomentum({
    current: info.viewCount,
    baseline: baseline[CHANNEL_VIEWS],
    baselineAgeDays: viewBaselineAgeDays,
    multiplier: 5.25,
    min: -25,
    max: 70,
    monotonic: true
  });
  const subscriberMomentum = calculateSnapshotMomentum({
    current: info.subscriberCount,
    baseline: baseline[SUBSCRIBERS],
    baselineAgeDays: subscriberBaselineAgeDays,
    multiplier: 4.5,
    min: -20,
    max: 65,
    monotonic: true
  });
  const uploadMomentum = calculatePointDeltaMomentum({
    current: info.videoCount,
    baseline: baseline[VIDEO_COUNT],
    baselineAgeDays: videoBaselineAgeDays,
    multiplier: 18,
    min: 0,
    max: 45,
    extremeJumpPoints: 6
  });
  const uploadAudienceValidation = validateUploadMomentumAgainstAudience({
    uploadMomentum: uploadMomentum.value,
    viewMomentum: viewMomentum.value,
    subscriberMomentum: subscriberMomentum.value
  });
  const stats: Partial<HypeStats> = {};

  if (
    typeof viewMomentum.value === "number" ||
    typeof subscriberMomentum.value === "number" ||
    typeof uploadAudienceValidation.value === "number"
  ) {
    const youtubeGrowth = weightedAverage([
      { value: viewMomentum.value, weight: 0.82 },
      { value: subscriberMomentum.value, weight: 0.16 },
      { value: uploadAudienceValidation.value, weight: 0.02 }
    ]);
    const socialGrowth = weightedAverage([
      { value: subscriberMomentum.value, weight: 0.75 },
      { value: viewMomentum.value, weight: 0.2 }
    ]);

    if (typeof youtubeGrowth === "number") {
      stats.youtubeGrowth = clamp(youtubeGrowth, -25, 70);
    }

    if (typeof socialGrowth === "number") {
      stats.socialGrowth = clamp(socialGrowth, -35, 120);
    }

    stats.newsScore = clamp(
      50 +
        (viewMomentum.value ?? 0) * 0.06 +
        (subscriberMomentum.value ?? 0) * 0.04 +
        Math.max(0, uploadAudienceValidation.value ?? 0) * 0.04,
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
    viewBaselineAgeDays,
    subscriberBaselineAgeDays,
    videoBaselineAgeDays,
    viewMomentum: viewMomentum.value,
    subscriberMomentum: subscriberMomentum.value,
    uploadMomentum: uploadMomentum.value,
    audienceValidatedUploadMomentum: uploadAudienceValidation.value,
    uploadMomentumValidation: uploadAudienceValidation.reason,
    viewMomentumQuality: buildMomentumQualityPayload(viewMomentum),
    subscriberMomentumQuality: buildMomentumQualityPayload(subscriberMomentum),
    uploadMomentumQuality: buildMomentumQualityPayload(uploadMomentum),
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
      confidence: clamp(
        0.84 *
          getCombinedConfidenceMultiplier([
            viewMomentum,
            subscriberMomentum,
            {
              ...uploadMomentum,
              value: uploadAudienceValidation.value,
              confidenceMultiplier: Math.min(
                uploadMomentum.confidenceMultiplier,
                uploadAudienceValidation.confidenceMultiplier
              )
            }
          ]),
        0.3,
        0.84
      ),
      rawPayload
    },
    observations
  };
}

function validateUploadMomentumAgainstAudience({
  uploadMomentum,
  viewMomentum,
  subscriberMomentum
}: {
  uploadMomentum: number | undefined;
  viewMomentum: number | undefined;
  subscriberMomentum: number | undefined;
}) {
  if (typeof uploadMomentum !== "number") {
    return {
      value: undefined,
      reason: "missing-upload-count",
      confidenceMultiplier: 0.42
    };
  }

  if (uploadMomentum <= 0) {
    return {
      value: uploadMomentum,
      reason: "no-positive-upload-momentum",
      confidenceMultiplier: 1
    };
  }

  const audienceMomentum =
    Math.max(0, viewMomentum ?? 0) * 0.72 + Math.max(0, subscriberMomentum ?? 0) * 0.28;

  if (audienceMomentum < 2) {
    return {
      value: Math.min(uploadMomentum, 2),
      reason: "upload-count-not-confirmed-by-audience",
      confidenceMultiplier: 0.35
    };
  }

  if (audienceMomentum < 5) {
    return {
      value: Math.min(uploadMomentum, 5),
      reason: "upload-count-weakly-confirmed-by-audience",
      confidenceMultiplier: 0.55
    };
  }

  if (audienceMomentum < 10) {
    return {
      value: Math.min(uploadMomentum, 10),
      reason: "upload-count-moderately-confirmed-by-audience",
      confidenceMultiplier: 0.72
    };
  }

  if (audienceMomentum < 18) {
    return {
      value: Math.min(uploadMomentum, 18),
      reason: "upload-count-confirmed-by-audience",
      confidenceMultiplier: 0.86
    };
  }

  return {
    value: uploadMomentum,
    reason: "upload-count-strongly-confirmed-by-audience",
    confidenceMultiplier: 1
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
