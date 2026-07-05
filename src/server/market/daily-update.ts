import { calculateHypeScore, calculateSignalDelta, clamp, getDailyChangePercent, roundPrice } from "@/lib/pricing";
import type { AdapterSignal, AdapterSignals, MarketSignalModifier } from "@/server/market/market-data";
import type { ArtistCategory, HypeStats } from "@/lib/types";

export type MarketUpdateSource = "mock" | "manual" | "gdelt" | "lastfm" | "spotify" | "youtube" | "core" | "blended";

type ResolvedMarketSignal = {
  stats: HypeStats;
  rawPayload: Record<string, unknown>;
  modifiers: MarketSignalModifier[];
  hasMomentumSignal: boolean;
};

export type MarketUpdateArtist = {
  id: string;
  name: string;
  ticker: string;
  currentPrice: number;
  previousClose: number;
  hypeScore: number;
  volatility: number;
  category: ArtistCategory;
  stats: HypeStats;
};

export type ManualSignals = Record<string, Partial<HypeStats>>;

export type MarketUpdateInput = {
  artists: MarketUpdateArtist[];
  runDate: string;
  source: MarketUpdateSource;
  manualSignals?: ManualSignals;
  adapterSignals?: AdapterSignals;
};

export type ArtistMarketUpdate = {
  artistId: string;
  ticker: string;
  previousClose: number;
  oldPrice: number;
  currentPrice: number;
  dailyChangePercent: number;
  hypeScore: number;
  stats: HypeStats;
  explanation: string;
  signalDelta: number;
  rawPayload: Record<string, unknown>;
};

export type MarketUpdateSummary = {
  runDate: string;
  source: MarketUpdateSource;
  artistCount: number;
  momentumArtistCount: number;
  averageMovePercent: number;
  averageSignalDelta: number;
  signalSourceCoverage: Record<string, { artistCount: number; statCount: number }>;
  topGainer: Pick<ArtistMarketUpdate, "artistId" | "ticker" | "dailyChangePercent"> | null;
  topLoser: Pick<ArtistMarketUpdate, "artistId" | "ticker" | "dailyChangePercent"> | null;
  batch?: {
    offset: number;
    limit: number | null;
    artistCount: number;
    totalArtists: number;
    nextOffset: number | null;
    hasMore: boolean;
  };
};

export function calculateDailyMarketUpdates(input: MarketUpdateInput) {
  const updates = input.artists.map((artist, index) =>
    calculateArtistUpdate({
      artist,
      index,
      runDate: input.runDate,
      source: input.source,
      manualSignals: input.manualSignals,
      adapterSignals: input.adapterSignals
    })
  );

  const averageMovePercent =
    updates.reduce((total, update) => total + update.dailyChangePercent, 0) / Math.max(1, updates.length);
  const averageSignalDelta =
    updates.reduce((total, update) => total + update.signalDelta, 0) / Math.max(1, updates.length);
  const sorted = [...updates].sort((a, b) => b.dailyChangePercent - a.dailyChangePercent);

  return {
    updates,
    summary: {
      runDate: input.runDate,
      source: input.source,
      artistCount: updates.length,
      momentumArtistCount: updates.filter((update) => update.rawPayload.hasMomentumSignal === true).length,
      averageMovePercent,
      averageSignalDelta,
      signalSourceCoverage: buildSignalSourceCoverage(updates),
      topGainer: sorted[0]
        ? pickLeaderboardMove(sorted[0])
        : null,
      topLoser: sorted[sorted.length - 1]
        ? pickLeaderboardMove(sorted[sorted.length - 1])
        : null
    } satisfies MarketUpdateSummary
  };
}

function buildSignalSourceCoverage(updates: ArtistMarketUpdate[]) {
  const coverage: Record<string, { artistCount: number; statCount: number }> = {};

  for (const update of updates) {
    const sourceWeights = getSourceWeights(update.rawPayload);

    if (!sourceWeights) {
      continue;
    }

    for (const [source, weights] of Object.entries(sourceWeights)) {
      const statCount = weights && typeof weights === "object" ? Object.keys(weights).length : 0;

      if (statCount === 0) {
        continue;
      }

      coverage[source] ??= { artistCount: 0, statCount: 0 };
      coverage[source].artistCount += 1;
      coverage[source].statCount += statCount;
    }
  }

  return coverage;
}

function getSourceWeights(rawPayload: Record<string, unknown>) {
  const sourceWeights = rawPayload.sourceWeights;

  if (!sourceWeights || typeof sourceWeights !== "object" || Array.isArray(sourceWeights)) {
    return null;
  }

  return sourceWeights as Record<string, Record<string, number>>;
}

function calculateArtistUpdate({
  artist,
  index,
  runDate,
  source,
  manualSignals,
  adapterSignals
}: {
  artist: MarketUpdateArtist;
  index: number;
  runDate: string;
  source: MarketUpdateSource;
  manualSignals?: ManualSignals;
  adapterSignals?: AdapterSignals;
}): ArtistMarketUpdate {
  const signals = getSignalsForArtist(artist, index, runDate, source, manualSignals, adapterSignals);
  const stats = signals.hasMomentumSignal ? blendStats(artist.stats, signals.stats) : artist.stats;
  const rawSignalDelta = signals.hasMomentumSignal ? calculateSignalDelta(stats) * artist.volatility : 0;
  const signalDelta = signals.hasMomentumSignal ? applySignalModifiers(rawSignalDelta, signals.modifiers) : 0;
  const targetPrice = artist.currentPrice * (1 + signalDelta);
  const blendedPrice = artist.currentPrice * 0.8 + targetPrice * 0.2;
  const cappedPrice = clamp(
    blendedPrice,
    artist.currentPrice * (1 - getCategoryDailyCap(artist.category)),
    artist.currentPrice * (1 + getCategoryDailyCap(artist.category))
  );
  const currentPrice = roundPrice(cappedPrice);
  const dailyChangePercent = getDailyChangePercent(currentPrice, artist.currentPrice);
  const hypeScore = calculateHypeScore(stats);

  return {
    artistId: artist.id,
    ticker: artist.ticker,
    previousClose: artist.currentPrice,
    oldPrice: artist.currentPrice,
    currentPrice,
    dailyChangePercent,
    hypeScore,
    stats,
    explanation: signals.hasMomentumSignal
      ? explainMove(artist.ticker, stats, dailyChangePercent, signals.modifiers)
      : explainFlatMove(artist.ticker, source),
    signalDelta,
    rawPayload: {
      ...signals.rawPayload,
      hasMomentumSignal: signals.hasMomentumSignal,
      rawSignalDelta,
      modifiers: signals.modifiers
    }
  };
}

function getSignalsForArtist(
  artist: MarketUpdateArtist,
  index: number,
  runDate: string,
  source: MarketUpdateSource,
  manualSignals?: ManualSignals,
  adapterSignals?: AdapterSignals
): ResolvedMarketSignal {
  if (source === "manual") {
    const manual = manualSignals?.[artist.id] ?? manualSignals?.[artist.ticker] ?? {};
    const adapter = adapterSignals?.[artist.id] ?? adapterSignals?.[artist.ticker];

    return buildExplicitSignal(
      artist.stats,
      combinePartialStats(manual, adapter?.stats),
      {
        source,
        manual,
        adapter: adapter?.rawPayload
      },
      adapter?.modifiers,
      "neutral"
    );
  }

  if (
    source === "gdelt" ||
    source === "lastfm" ||
    source === "spotify" ||
    source === "youtube" ||
    source === "core" ||
    source === "blended"
  ) {
    const adapter = adapterSignals?.[artist.id] ?? adapterSignals?.[artist.ticker];

    return buildExplicitSignal(
      artist.stats,
      adapter?.stats ?? {},
      {
        source,
        adapter: adapter?.rawPayload ?? {
          status: "missing",
          note: `No ${source} signal was available for this artist.`
        }
      },
      adapter?.modifiers,
      "neutral"
    );
  }

  const mockSignal = {
    stats: getMockStats(artist, index, runDate),
    rawPayload: {
      source,
      seed: hashToUnit(`${runDate}:${artist.id}:${index}`),
      note: "Mock normalized momentum signals. Replace this source with real adapters."
    }
  };
  const adapter = adapterSignals?.[artist.id] ?? adapterSignals?.[artist.ticker];

  return buildExplicitSignal(
    artist.stats,
    combinePartialStats(mockSignal.stats, adapter?.stats),
    {
      ...mockSignal.rawPayload,
      adapter: adapter?.rawPayload
    },
    adapter?.modifiers
  );
}

function getMockStats(artist: MarketUpdateArtist, index: number, runDate: string): HypeStats {
  const seed = hashToUnit(`${runDate}:${artist.id}:${index}`);
  const wave = Math.sin(seed * Math.PI * 2) * artist.volatility;
  const breakout = seed > 0.84 ? 1 : 0;

  return {
    streamingGrowth: clamp(artist.stats.streamingGrowth * 0.72 + wave * 6 + breakout * 18, -25, 75),
    youtubeGrowth: clamp(artist.stats.youtubeGrowth * 0.68 + wave * 5 + breakout * 14, -25, 70),
    searchGrowth: clamp(artist.stats.searchGrowth * 0.74 + wave * 7 + breakout * 22, -30, 95),
    socialGrowth: clamp(artist.stats.socialGrowth * 0.66 + wave * 9 + breakout * 30, -35, 120),
    newsScore: clamp(artist.stats.newsScore * 0.82 + 9 + Math.max(0, wave * 5) + breakout * 18, 0, 100),
    traderDemand: clamp(artist.stats.traderDemand * 0.58 + wave * 4, -40, 40)
  };
}

function combinePartialStats(
  primary?: Partial<HypeStats>,
  secondary?: Partial<HypeStats>
): Partial<HypeStats> {
  const stats = { ...primary };
  const keys: Array<keyof HypeStats> = [
    "streamingGrowth",
    "youtubeGrowth",
    "searchGrowth",
    "socialGrowth",
    "newsScore",
    "traderDemand"
  ];

  for (const key of keys) {
    const first = primary?.[key];
    const second = secondary?.[key];

    if (typeof first === "number" && typeof second === "number") {
      stats[key] = first * 0.65 + second * 0.35;
    } else if (typeof second === "number") {
      stats[key] = second;
    }
  }

  return stats;
}

function applySignalModifiers(signalDelta: number, modifiers: MarketSignalModifier[]) {
  return clamp(
    modifiers.reduce((value, modifier) => {
      const multiplied = typeof modifier.priceMultiplier === "number" ? value * modifier.priceMultiplier : value;
      return multiplied + (modifier.priceShock ?? 0);
    }, signalDelta),
    -0.75,
    0.75
  );
}

export function mergeAdapterSignals(...sources: Array<AdapterSignals | undefined>) {
  const buckets: Record<
    string,
    {
      stats: Partial<Record<keyof HypeStats, { total: number; weight: number }>>;
      rawPayload: Record<string, unknown>;
      modifiers: MarketSignalModifier[];
      sourceWeights: Record<string, Record<string, number>>;
    }
  > = {};

  for (const source of sources) {
    if (!source) {
      continue;
    }

    for (const [artistId, signal] of Object.entries(source)) {
      const sourceName = getSignalSourceName(signal);
      const confidence = getSignalConfidence(signal, sourceName);
      const payload =
        typeof signal.rawPayload.source === "string" && signal.rawPayload.source
          ? { [signal.rawPayload.source]: signal.rawPayload }
          : signal.rawPayload;
      const bucket = buckets[artistId] ?? {
        stats: {},
        rawPayload: {},
        modifiers: [],
        sourceWeights: {}
      };

      for (const key of getHypeStatKeys()) {
        const value = signal.stats[key];

        if (typeof value !== "number") {
          continue;
        }

        const weight = confidence * getStatSourceWeight(key, sourceName);

        if (weight <= 0) {
          continue;
        }

        bucket.stats[key] ??= { total: 0, weight: 0 };
        bucket.stats[key].total += value * weight;
        bucket.stats[key].weight += weight;
        bucket.sourceWeights[sourceName] ??= {};
        bucket.sourceWeights[sourceName][key] = weight;
      }

      bucket.rawPayload = {
        ...bucket.rawPayload,
        ...payload
      };
      bucket.modifiers.push(...(signal.modifiers ?? []));
      buckets[artistId] = bucket;
    }
  }

  return Object.fromEntries(
    Object.entries(buckets).map(([artistId, bucket]) => [
      artistId,
      {
        stats: Object.fromEntries(
          Object.entries(bucket.stats).map(([key, value]) => [key, value.total / Math.max(0.0001, value.weight)])
        ),
        rawPayload: {
          ...bucket.rawPayload,
          sourceWeights: bucket.sourceWeights
        },
        modifiers: bucket.modifiers
      } satisfies AdapterSignal
    ])
  );
}

function getHypeStatKeys(): Array<keyof HypeStats> {
  return [
    "streamingGrowth",
    "youtubeGrowth",
    "searchGrowth",
    "socialGrowth",
    "newsScore",
    "traderDemand"
  ];
}

function getSignalSourceName(signal: AdapterSignal) {
  const source = signal.rawPayload.source;

  return typeof source === "string" && source ? source : "adapter";
}

function getSignalConfidence(signal: AdapterSignal, sourceName: string) {
  if (typeof signal.confidence === "number" && Number.isFinite(signal.confidence)) {
    return clamp(signal.confidence, 0, 1);
  }

  const defaults: Record<string, number> = {
    lastfm: 0.86,
    youtube: 0.84,
    youtube_comments: 0.68,
    spotify: 0.7,
    gdelt: 0.58,
    market_events: 0.78,
    trade_flow: 0.72,
    adapter: 0.5
  };

  return defaults[sourceName] ?? 0.5;
}

function getStatSourceWeight(key: keyof HypeStats, sourceName: string) {
  const weights: Record<string, Partial<Record<keyof HypeStats, number>>> = {
    lastfm: {
      streamingGrowth: 1,
      socialGrowth: 0.5
    },
    spotify: {
      streamingGrowth: 0.75,
      searchGrowth: 0.55
    },
    youtube: {
      youtubeGrowth: 1,
      socialGrowth: 0.6,
      newsScore: 0.25
    },
    youtube_comments: {
      socialGrowth: 0.85,
      newsScore: 0.45,
      searchGrowth: 0.35,
      youtubeGrowth: 0.25
    },
    gdelt: {
      searchGrowth: 0.75,
      socialGrowth: 0.4,
      newsScore: 0.7
    },
    market_events: {
      searchGrowth: 0.45,
      socialGrowth: 0.5,
      newsScore: 0.85
    },
    trade_flow: {
      traderDemand: 1
    },
    adapter: {
      streamingGrowth: 0.5,
      youtubeGrowth: 0.5,
      searchGrowth: 0.5,
      socialGrowth: 0.5,
      newsScore: 0.5,
      traderDemand: 0.5
    }
  };

  return weights[sourceName]?.[key] ?? 0.35;
}

function buildExplicitSignal(
  existing: HypeStats,
  incoming: Partial<HypeStats>,
  rawPayload: Record<string, unknown>,
  modifiers: MarketSignalModifier[] = [],
  fallback: "existing" | "neutral" = "existing"
): ResolvedMarketSignal {
  const base = fallback === "neutral" ? getNeutralStats() : existing;

  return {
    stats: {
      streamingGrowth: incoming.streamingGrowth ?? base.streamingGrowth,
      youtubeGrowth: incoming.youtubeGrowth ?? base.youtubeGrowth,
      searchGrowth: incoming.searchGrowth ?? base.searchGrowth,
      socialGrowth: incoming.socialGrowth ?? base.socialGrowth,
      newsScore: incoming.newsScore ?? base.newsScore,
      traderDemand: incoming.traderDemand ?? base.traderDemand
    },
    rawPayload,
    modifiers,
    hasMomentumSignal: hasPartialStats(incoming) || modifiers.length > 0
  };
}

function getNeutralStats(): HypeStats {
  return {
    streamingGrowth: 0,
    youtubeGrowth: 0,
    searchGrowth: 0,
    socialGrowth: 0,
    newsScore: 50,
    traderDemand: 0
  };
}

function hasPartialStats(stats: Partial<HypeStats>) {
  return [
    stats.streamingGrowth,
    stats.youtubeGrowth,
    stats.searchGrowth,
    stats.socialGrowth,
    stats.newsScore,
    stats.traderDemand
  ].some((value) => typeof value === "number");
}

function blendStats(existing: HypeStats, incoming: HypeStats): HypeStats {
  return {
    streamingGrowth: clamp(existing.streamingGrowth * 0.25 + incoming.streamingGrowth * 0.75, -25, 75),
    youtubeGrowth: clamp(existing.youtubeGrowth * 0.25 + incoming.youtubeGrowth * 0.75, -25, 70),
    searchGrowth: clamp(existing.searchGrowth * 0.25 + incoming.searchGrowth * 0.75, -30, 95),
    socialGrowth: clamp(existing.socialGrowth * 0.25 + incoming.socialGrowth * 0.75, -35, 120),
    newsScore: clamp(existing.newsScore * 0.35 + incoming.newsScore * 0.65, 0, 100),
    traderDemand: clamp(existing.traderDemand * 0.45 + incoming.traderDemand * 0.55, -40, 40)
  };
}

function explainMove(
  ticker: string,
  stats: HypeStats,
  dailyChangePercent: number,
  modifiers: MarketSignalModifier[] = []
) {
  const signals = [
    ["streaming momentum", stats.streamingGrowth],
    ["video momentum", stats.youtubeGrowth],
    ["discovery trend", stats.searchGrowth],
    ["fan sentiment", stats.socialGrowth],
    ["media and reviews", stats.newsScore - 50],
    ["trading demand", stats.traderDemand]
  ] as const;
  const [signalName] = signals.reduce((best, current) =>
    Math.abs(current[1]) > Math.abs(best[1]) ? current : best
  );
  const direction = dailyChangePercent >= 0 ? "moved higher" : "pulled back";
  const strongestModifier = modifiers
    .filter((modifier) => typeof modifier.score === "number")
    .sort((a, b) => Math.abs(b.score ?? 0) - Math.abs(a.score ?? 0))[0];

  if (strongestModifier) {
    return `${ticker} ${direction} after ${signalName} led the daily hype model, with ${strongestModifier.reason} adjusting the move.`;
  }

  return `${ticker} ${direction} after ${signalName} led the daily hype model.`;
}

function explainFlatMove(ticker: string, source: MarketUpdateSource) {
  if (
    source === "gdelt" ||
    source === "lastfm" ||
    source === "spotify" ||
    source === "youtube" ||
    source === "core" ||
    source === "blended"
  ) {
    return `${ticker} held flat while the market collected baseline data without a confirmed momentum signal.`;
  }

  return `${ticker} held flat with no confirmed daily momentum signal.`;
}

function getCategoryDailyCap(category: ArtistCategory) {
  const caps: Record<ArtistCategory, number> = {
    superstar: 0.12,
    mainstream: 0.18,
    rising: 0.24,
    underground: 0.3
  };

  return caps[category];
}

function pickLeaderboardMove(update: ArtistMarketUpdate) {
  return {
    artistId: update.artistId,
    ticker: update.ticker,
    dailyChangePercent: update.dailyChangePercent
  };
}

function hashToUnit(input: string) {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 4294967295;
}
