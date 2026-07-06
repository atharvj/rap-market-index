import { calculateHypeScore, calculateSignalDelta, clamp, getDailyChangePercent, roundPrice } from "@/lib/pricing";
import type { AdapterSignal, AdapterSignals, MarketSignalModifier } from "@/server/market/market-data";
import { getMarketModelVersion } from "@/server/market/model-version";
import type { ArtistCategory, HypeStats } from "@/lib/types";

export type MarketUpdateSource =
  | "mock"
  | "manual"
  | "gdelt"
  | "lastfm"
  | "spotify"
  | "youtube"
  | "wikimedia"
  | "reddit"
  | "bluesky"
  | "core"
  | "blended";

type ResolvedMarketSignal = {
  stats: HypeStats;
  rawPayload: Record<string, unknown>;
  modifiers: MarketSignalModifier[];
  hasMomentumSignal: boolean;
  reliability: number;
  reliabilityDetails: Record<string, unknown>;
};

type ModifierAudit = {
  reason: string;
  direction: "positive" | "negative" | "neutral";
  priceShock: number;
  priceMultiplier: number | null;
  score: number | null;
  reasonPriority: number;
  sortScore: number;
};

type CatalystDiagnostics = {
  modifierCount: number;
  positiveCatalystCount: number;
  negativeCatalystCount: number;
  highPriorityCatalystCount: number;
  positivePriceShock: number;
  negativePriceShock: number;
  netPriceShock: number;
  primaryCatalyst: ModifierAudit | null;
  counterCatalyst: ModifierAudit | null;
  topCatalysts: ModifierAudit[];
};

type SourceAttributionItem = {
  source: string;
  label: string;
  direction: "positive" | "negative" | "neutral";
  score: number;
  statCount: number;
  totalWeight: number;
  alignedWithMove: boolean;
};

type SourceAttribution = {
  sourceCount: number;
  positiveSourceCount: number;
  negativeSourceCount: number;
  neutralSourceCount: number;
  leadingSource: SourceAttributionItem | null;
  opposingSource: SourceAttributionItem | null;
  sourceSpread: number;
  sources: SourceAttributionItem[];
};

export type PriceTrendContext = {
  sampleCount: number;
  return7dPercent: number;
  return30dPercent: number;
  realizedVolatilityPercent: number;
  upDayCount: number;
  downDayCount: number;
  latestPriceDate: string | null;
};

export type MarketUpdateArtist = {
  id: string;
  name: string;
  ticker: string;
  currentPrice: number;
  previousClose: number;
  previousCloseSource?: "artist" | "price_history";
  hypeScore: number;
  volatility: number;
  category: ArtistCategory;
  stats: HypeStats;
  priceTrend?: PriceTrendContext;
};

export type ManualSignals = Record<string, Partial<HypeStats>>;

export type MarketUpdateInput = {
  artists: MarketUpdateArtist[];
  runDate: string;
  source: MarketUpdateSource;
  modelVersion?: string;
  manualSignals?: ManualSignals;
  adapterSignals?: AdapterSignals;
  marketCoverageRatio?: number;
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
  modelVersion: string;
  rawPayload: Record<string, unknown>;
};

export type MarketUpdateSummary = {
  runDate: string;
  source: MarketUpdateSource;
  modelVersion: string;
  artistCount: number;
  momentumArtistCount: number;
  averageMovePercent: number;
  averageAbsMovePercent: number;
  averageSignalDelta: number;
  averageSignalReliability: number;
  upMoveCount: number;
  downMoveCount: number;
  flatMoveCount: number;
  lowReliabilityCount: number;
  mediumReliabilityCount: number;
  highReliabilityCount: number;
  sourceQualityAnomalyCount: number;
  sourceQualityStaleCount: number;
  averageSourceQualityMultiplier: number;
  technicalAdjustmentCount: number;
  averageTechnicalAdjustment: number;
  catalystArtistCount: number;
  highPriorityCatalystArtistCount: number;
  mixedCatalystArtistCount: number;
  averageNetCatalystShock: number;
  averageAbsCatalystShock: number;
  sourceConflictArtistCount: number;
  averageSourceDirectionSpread: number;
  averageSourceCount: number;
  signalCoverageScore: number;
  reliabilityScore: number;
  movementBalanceScore: number;
  marketQualityScore: number;
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
  const modelVersion = input.modelVersion ?? getMarketModelVersion();
  const standaloneUpdates = input.artists.map((artist, index) =>
    calculateArtistUpdate({
      artist,
      index,
      runDate: input.runDate,
      source: input.source,
      modelVersion,
      manualSignals: input.manualSignals,
      adapterSignals: input.adapterSignals
    })
  );
  const updates = applyMarketRelativePricing(standaloneUpdates, input.marketCoverageRatio);

  const averageMovePercent =
    updates.reduce((total, update) => total + update.dailyChangePercent, 0) / Math.max(1, updates.length);
  const averageAbsMovePercent =
    updates.reduce((total, update) => total + Math.abs(update.dailyChangePercent), 0) / Math.max(1, updates.length);
  const averageSignalDelta =
    updates.reduce((total, update) => total + update.signalDelta, 0) / Math.max(1, updates.length);
  const averageSignalReliability =
    updates.reduce((total, update) => total + getNumber(update.rawPayload.signalReliability, 0), 0) /
    Math.max(1, updates.length);
  const reliabilityCounts = countReliabilityBands(updates);
  const momentumArtistCount = updates.filter((update) => update.rawPayload.hasMomentumSignal === true).length;
  const upMoveCount = updates.filter((update) => update.dailyChangePercent > 0.01).length;
  const downMoveCount = updates.filter((update) => update.dailyChangePercent < -0.01).length;
  const flatMoveCount = updates.filter((update) => Math.abs(update.dailyChangePercent) <= 0.01).length;
  const sourceQuality = summarizeSourceQuality(updates);
  const technicals = summarizeTechnicalAdjustments(updates);
  const catalysts = summarizeCatalystDiagnostics(updates);
  const sourceAttribution = summarizeSourceAttribution(updates);
  const quality = calculateMarketRunQuality({
    artistCount: updates.length,
    momentumArtistCount,
    averageAbsMovePercent,
    upMoveCount,
    downMoveCount,
    flatMoveCount,
    reliabilityCounts
  });
  const sorted = [...updates].sort((a, b) => b.dailyChangePercent - a.dailyChangePercent);

  return {
    updates,
    summary: {
      runDate: input.runDate,
      source: input.source,
      modelVersion,
      artistCount: updates.length,
      momentumArtistCount,
      averageMovePercent,
      averageAbsMovePercent,
      averageSignalDelta,
      averageSignalReliability,
      upMoveCount,
      downMoveCount,
      flatMoveCount,
      lowReliabilityCount: reliabilityCounts.low,
      mediumReliabilityCount: reliabilityCounts.medium,
      highReliabilityCount: reliabilityCounts.high,
      sourceQualityAnomalyCount: sourceQuality.anomalyCount,
      sourceQualityStaleCount: sourceQuality.staleCount,
      averageSourceQualityMultiplier: sourceQuality.averageMultiplier,
      technicalAdjustmentCount: technicals.adjustmentCount,
      averageTechnicalAdjustment: technicals.averageAdjustment,
      catalystArtistCount: catalysts.catalystArtistCount,
      highPriorityCatalystArtistCount: catalysts.highPriorityCatalystArtistCount,
      mixedCatalystArtistCount: catalysts.mixedCatalystArtistCount,
      averageNetCatalystShock: catalysts.averageNetCatalystShock,
      averageAbsCatalystShock: catalysts.averageAbsCatalystShock,
      sourceConflictArtistCount: sourceAttribution.sourceConflictArtistCount,
      averageSourceDirectionSpread: sourceAttribution.averageSourceDirectionSpread,
      averageSourceCount: sourceAttribution.averageSourceCount,
      signalCoverageScore: quality.signalCoverageScore,
      reliabilityScore: quality.reliabilityScore,
      movementBalanceScore: quality.movementBalanceScore,
      marketQualityScore: quality.marketQualityScore,
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

function applyMarketRelativePricing(updates: ArtistMarketUpdate[], marketCoverageRatio = 1): ArtistMarketUpdate[] {
  if (updates.length < 2 || !updates.some((update) => update.rawPayload.hasMomentumSignal === true)) {
    return updates;
  }

  const marketContextConfidence = getMarketContextConfidence(marketCoverageRatio);
  const sortedSignalDeltas = updates.map((update) => update.signalDelta).sort((left, right) => left - right);
  const marketAverageSignalDelta =
    updates.reduce((total, update) => total + update.signalDelta, 0) / Math.max(1, updates.length);
  const marketMedianSignalDelta = getMedian(sortedSignalDeltas);
  const marketSignalBreadth =
    updates.filter((update) => update.signalDelta > 0).length / Math.max(1, updates.length);

  if (Math.abs(marketAverageSignalDelta) < 0.0001 && Math.abs(marketMedianSignalDelta) < 0.0001) {
    return updates;
  }

  return updates.map((update) =>
    applyRelativePressure({
      update,
      marketAverageSignalDelta,
      marketMedianSignalDelta,
      marketSignalBreadth,
      signalStrengthRank: getPercentileRank(update.signalDelta, sortedSignalDeltas),
      marketContextConfidence,
      marketCoverageRatio
    })
  );
}

function applyRelativePressure({
  update,
  marketAverageSignalDelta,
  marketMedianSignalDelta,
  marketSignalBreadth,
  signalStrengthRank,
  marketContextConfidence,
  marketCoverageRatio
}: {
  update: ArtistMarketUpdate;
  marketAverageSignalDelta: number;
  marketMedianSignalDelta: number;
  marketSignalBreadth: number;
  signalStrengthRank: number;
  marketContextConfidence: number;
  marketCoverageRatio: number;
}): ArtistMarketUpdate {
  const relativeSignalDelta = update.signalDelta - marketMedianSignalDelta;
  const marketRelativeAdjustment = clamp(relativeSignalDelta * 0.55 * marketContextConfidence, -0.02, 0.02);
  const broadMarketDampener =
    marketAverageSignalDelta > 0 && marketSignalBreadth >= 0.75
      ? -clamp(marketAverageSignalDelta * 0.08 * marketContextConfidence, 0, 0.003)
      : 0;
  const crowdedPositiveMarketPressure =
    marketAverageSignalDelta > 0 &&
    marketMedianSignalDelta > 0 &&
    marketSignalBreadth >= 0.72
      ? -clamp(
          (marketAverageSignalDelta * 0.1 + marketMedianSignalDelta * 0.08) * marketContextConfidence,
          0.0005,
          signalStrengthRank <= 0.4 ? 0.006 : 0.003
        )
      : 0;
  const laggardRotationDrift =
    marketAverageSignalDelta > 0 &&
    marketMedianSignalDelta > 0 &&
    marketSignalBreadth >= 0.35 &&
    signalStrengthRank <= 0.35
      ? -clamp(
          (marketMedianSignalDelta - update.signalDelta + marketAverageSignalDelta * 0.5) *
            0.35 *
            marketContextConfidence,
          0.001,
          0.01
        )
      : 0;
  const relativeOpportunityCostDrift =
    marketAverageSignalDelta > 0 &&
    marketMedianSignalDelta > 0 &&
    marketSignalBreadth >= 0.55 &&
    signalStrengthRank <= 0.25 &&
    !hasPositiveHighPriorityCatalyst(update)
      ? -clamp(
          (marketMedianSignalDelta - update.signalDelta + marketAverageSignalDelta * 0.65) *
            0.42 *
            marketContextConfidence,
          0.0015,
          0.012
        )
      : 0;
  const noSignalLiquidityDrift =
    update.rawPayload.hasMomentumSignal === true || marketAverageSignalDelta <= 0
      ? 0
      : -clamp(marketAverageSignalDelta * 0.3 * marketContextConfidence, 0.001, 0.007);
  const adjustedSignalDelta =
    update.signalDelta +
    marketRelativeAdjustment +
    broadMarketDampener +
    crowdedPositiveMarketPressure +
    laggardRotationDrift +
    relativeOpportunityCostDrift +
    noSignalLiquidityDrift;
  const repriced = priceFromSignalDelta(update, adjustedSignalDelta);
  const shouldExplainRelativeMove =
    repriced.dailyChangePercent < 0 ||
    (update.rawPayload.hasMomentumSignal !== true && Math.abs(repriced.dailyChangePercent) >= 0.01);

  return {
    ...update,
    currentPrice: repriced.currentPrice,
    dailyChangePercent: repriced.dailyChangePercent,
    signalDelta: adjustedSignalDelta,
    explanation: shouldExplainRelativeMove
      ? explainRelativeMove(update.ticker, repriced.dailyChangePercent, update.rawPayload.hasMomentumSignal === true)
      : update.explanation,
    rawPayload: {
      ...(update.rawPayload as Record<string, unknown>),
      standaloneSignalDelta: update.signalDelta,
      marketAverageSignalDelta,
      marketMedianSignalDelta,
      marketSignalBreadth,
      signalStrengthRank,
      marketCoverageRatio,
      marketContextConfidence,
      marketRelativeAdjustment,
      broadMarketDampener,
      crowdedPositiveMarketPressure,
      laggardRotationDrift,
      relativeOpportunityCostDrift,
      noSignalLiquidityDrift,
      adjustedSignalDelta
    }
  } satisfies ArtistMarketUpdate;
}

function hasPositiveHighPriorityCatalyst(update: ArtistMarketUpdate) {
  const diagnostics = getObjectRecord(update.rawPayload.catalystDiagnostics);
  const catalysts = diagnostics.topCatalysts;

  if (!Array.isArray(catalysts)) {
    return false;
  }

  return catalysts.some((value) => {
    const catalyst = getObjectRecord(value);

    return (
      catalyst.direction === "positive" &&
      getNumber(catalyst.reasonPriority, 0) >= 8 &&
      getNumber(catalyst.priceShock, 0) >= 0.004
    );
  });
}

function priceFromSignalDelta(update: ArtistMarketUpdate, signalDelta: number) {
  const previousClose = getValidPrice(update.previousClose, update.oldPrice);
  const dailyCap = getNumber(update.rawPayload.dailyCap, 0.18);
  const targetPrice = update.oldPrice * (1 + signalDelta);
  const blendedPrice = update.oldPrice * 0.8 + targetPrice * 0.2;
  const cappedPrice = clamp(blendedPrice, previousClose * (1 - dailyCap), previousClose * (1 + dailyCap));
  const currentPrice = roundPrice(cappedPrice);

  return {
    currentPrice,
    dailyChangePercent: getDailyChangePercent(currentPrice, previousClose)
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

function summarizeSourceQuality(updates: ArtistMarketUpdate[]) {
  if (!updates.length) {
    return {
      anomalyCount: 0,
      staleCount: 0,
      averageMultiplier: 1
    };
  }

  const summary = updates.reduce(
    (memo, update) => {
      const details = getObjectRecord(update.rawPayload.reliabilityDetails);

      memo.anomalyCount += getNumber(details.sourceQualityAnomalyCount, 0);
      memo.staleCount += getNumber(details.sourceQualityStaleCount, 0);
      memo.multiplierTotal += getNumber(details.sourceQualityMultiplier, 1);
      return memo;
    },
    {
      anomalyCount: 0,
      staleCount: 0,
      multiplierTotal: 0
    }
  );

  return {
    anomalyCount: summary.anomalyCount,
    staleCount: summary.staleCount,
    averageMultiplier: summary.multiplierTotal / Math.max(1, updates.length)
  };
}

function summarizeTechnicalAdjustments(updates: ArtistMarketUpdate[]) {
  if (!updates.length) {
    return {
      adjustmentCount: 0,
      averageAdjustment: 0
    };
  }

  const summary = updates.reduce(
    (memo, update) => {
      const technicalAdjustment = getObjectRecord(update.rawPayload.technicalAdjustment);
      const adjustment = getNumber(technicalAdjustment.adjustment, 0);

      if (Math.abs(adjustment) >= 0.0001) {
        memo.adjustmentCount += 1;
      }

      memo.adjustmentTotal += adjustment;
      return memo;
    },
    {
      adjustmentCount: 0,
      adjustmentTotal: 0
    }
  );

  return {
    adjustmentCount: summary.adjustmentCount,
    averageAdjustment: summary.adjustmentTotal / Math.max(1, updates.length)
  };
}

function summarizeCatalystDiagnostics(updates: ArtistMarketUpdate[]) {
  if (!updates.length) {
    return {
      catalystArtistCount: 0,
      highPriorityCatalystArtistCount: 0,
      mixedCatalystArtistCount: 0,
      averageNetCatalystShock: 0,
      averageAbsCatalystShock: 0
    };
  }

  const summary = updates.reduce(
    (memo, update) => {
      const diagnostics = getObjectRecord(update.rawPayload.catalystDiagnostics);
      const modifierCount = getNumber(diagnostics.modifierCount, 0);
      const positiveCatalystCount = getNumber(diagnostics.positiveCatalystCount, 0);
      const negativeCatalystCount = getNumber(diagnostics.negativeCatalystCount, 0);
      const highPriorityCatalystCount = getNumber(diagnostics.highPriorityCatalystCount, 0);
      const netPriceShock = getNumber(diagnostics.netPriceShock, 0);
      const absPriceShock =
        Math.abs(getNumber(diagnostics.positivePriceShock, 0)) + Math.abs(getNumber(diagnostics.negativePriceShock, 0));

      if (modifierCount > 0) {
        memo.catalystArtistCount += 1;
      }

      if (highPriorityCatalystCount > 0) {
        memo.highPriorityCatalystArtistCount += 1;
      }

      if (positiveCatalystCount > 0 && negativeCatalystCount > 0) {
        memo.mixedCatalystArtistCount += 1;
      }

      memo.netShockTotal += netPriceShock;
      memo.absShockTotal += absPriceShock;
      return memo;
    },
    {
      catalystArtistCount: 0,
      highPriorityCatalystArtistCount: 0,
      mixedCatalystArtistCount: 0,
      netShockTotal: 0,
      absShockTotal: 0
    }
  );

  return {
    catalystArtistCount: summary.catalystArtistCount,
    highPriorityCatalystArtistCount: summary.highPriorityCatalystArtistCount,
    mixedCatalystArtistCount: summary.mixedCatalystArtistCount,
    averageNetCatalystShock: summary.netShockTotal / Math.max(1, updates.length),
    averageAbsCatalystShock: summary.absShockTotal / Math.max(1, updates.length)
  };
}

function summarizeSourceAttribution(updates: ArtistMarketUpdate[]) {
  if (!updates.length) {
    return {
      sourceConflictArtistCount: 0,
      averageSourceDirectionSpread: 0,
      averageSourceCount: 0
    };
  }

  const summary = updates.reduce(
    (memo, update) => {
      const attribution = getObjectRecord(update.rawPayload.sourceAttribution);
      const positiveSourceCount = getNumber(attribution.positiveSourceCount, 0);
      const negativeSourceCount = getNumber(attribution.negativeSourceCount, 0);

      if (positiveSourceCount > 0 && negativeSourceCount > 0) {
        memo.sourceConflictArtistCount += 1;
      }

      memo.spreadTotal += getNumber(attribution.sourceSpread, 0);
      memo.sourceCountTotal += getNumber(attribution.sourceCount, 0);
      return memo;
    },
    {
      sourceConflictArtistCount: 0,
      spreadTotal: 0,
      sourceCountTotal: 0
    }
  );

  return {
    sourceConflictArtistCount: summary.sourceConflictArtistCount,
    averageSourceDirectionSpread: summary.spreadTotal / Math.max(1, updates.length),
    averageSourceCount: summary.sourceCountTotal / Math.max(1, updates.length)
  };
}

function countReliabilityBands(updates: ArtistMarketUpdate[]) {
  return updates.reduce(
    (counts, update) => {
      const reliability = getNumber(update.rawPayload.signalReliability, 0);

      if (reliability >= 0.7) {
        counts.high += 1;
      } else if (reliability >= 0.4) {
        counts.medium += 1;
      } else {
        counts.low += 1;
      }

      return counts;
    },
    {
      low: 0,
      medium: 0,
      high: 0
    }
  );
}

function calculateMarketRunQuality({
  artistCount,
  momentumArtistCount,
  averageAbsMovePercent,
  upMoveCount,
  downMoveCount,
  flatMoveCount,
  reliabilityCounts
}: {
  artistCount: number;
  momentumArtistCount: number;
  averageAbsMovePercent: number;
  upMoveCount: number;
  downMoveCount: number;
  flatMoveCount: number;
  reliabilityCounts: { low: number; medium: number; high: number };
}) {
  if (artistCount <= 0) {
    return {
      signalCoverageScore: 0,
      reliabilityScore: 0,
      movementBalanceScore: 0,
      marketQualityScore: 0
    };
  }

  const activeMoveCount = Math.max(0, artistCount - flatMoveCount);
  const signalCoverageScore = clamp(momentumArtistCount / artistCount * 100, 0, 100);
  const reliabilityScore = clamp(
    (reliabilityCounts.high * 100 + reliabilityCounts.medium * 65 + reliabilityCounts.low * 28) / artistCount,
    0,
    100
  );
  const directionBalance =
    activeMoveCount <= 2
      ? 58
      : upMoveCount > 0 && downMoveCount > 0
        ? Math.min(upMoveCount, downMoveCount) / Math.max(upMoveCount, downMoveCount) * 100
        : 18;
  const movementDisciplineScore = clamp(100 - Math.max(0, averageAbsMovePercent - 3) * 10, 45, 100);
  const movementBalanceScore = clamp(directionBalance * 0.72 + movementDisciplineScore * 0.28, 0, 100);
  const marketQualityScore = clamp(
    signalCoverageScore * 0.34 + reliabilityScore * 0.36 + movementBalanceScore * 0.3,
    0,
    100
  );

  return {
    signalCoverageScore: Math.round(signalCoverageScore),
    reliabilityScore: Math.round(reliabilityScore),
    movementBalanceScore: Math.round(movementBalanceScore),
    marketQualityScore: Math.round(marketQualityScore)
  };
}

function getSourceWeights(rawPayload: Record<string, unknown>) {
  const sourceWeights = rawPayload.sourceWeights;

  if (!sourceWeights || typeof sourceWeights !== "object" || Array.isArray(sourceWeights)) {
    return null;
  }

  return sourceWeights as Record<string, Record<string, number>>;
}

function getObjectRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function applyTechnicalPriceContext({
  signalDelta,
  priceTrend,
  hasMomentumSignal,
  reliability
}: {
  signalDelta: number;
  priceTrend?: PriceTrendContext;
  hasMomentumSignal: boolean;
  reliability: number;
}) {
  if (!priceTrend || priceTrend.sampleCount < 3) {
    return {
      signalDelta,
      adjustment: 0,
      volatilityMultiplier: 1,
      reasons: [],
      priceTrend: priceTrend ?? null
    };
  }

  const reasons: string[] = [];
  let adjustment = 0;
  const overextendedMove = Math.max(
    clamp((priceTrend.return7dPercent - 12) / 100, 0, 0.018),
    clamp((priceTrend.return30dPercent - 35) / 100, 0, 0.018)
  );
  const downtrendPressure = Math.max(
    clamp((-priceTrend.return7dPercent - 8) / 140, 0, 0.012),
    clamp((-priceTrend.return30dPercent - 24) / 150, 0, 0.016)
  );
  const strongPositiveSignal = signalDelta >= 0.035 && reliability >= 0.64;
  const weakPositiveSignal = signalDelta > 0 && reliability < 0.58;

  if (overextendedMove > 0 && (!strongPositiveSignal || !hasMomentumSignal)) {
    const pullback = overextendedMove * (hasMomentumSignal ? 0.55 : 0.9);
    adjustment -= pullback;
    reasons.push("overextended_price_action");
  }

  if (downtrendPressure > 0 && weakPositiveSignal) {
    adjustment -= downtrendPressure;
    reasons.push("weak_signal_against_downtrend");
  } else if (downtrendPressure > 0 && !hasMomentumSignal) {
    adjustment -= Math.min(0.007, downtrendPressure * 0.75);
    reasons.push("downtrend_continuation");
  } else if (downtrendPressure > 0 && strongPositiveSignal) {
    adjustment += Math.min(0.006, downtrendPressure * 0.45);
    reasons.push("confirmed_reversal_support");
  }

  if (
    hasMomentumSignal &&
    reliability >= 0.72 &&
    signalDelta > 0.025 &&
    priceTrend.return7dPercent > 3 &&
    priceTrend.return30dPercent > -10 &&
    overextendedMove <= 0.006
  ) {
    adjustment += Math.min(0.005, signalDelta * 0.08);
    reasons.push("confirmed_breakout_follow_through");
  }

  const volatilityMultiplier =
    priceTrend.realizedVolatilityPercent > 10 && reliability < 0.7
      ? clamp(1 - (priceTrend.realizedVolatilityPercent - 10) * 0.018, 0.78, 1)
      : 1;
  const adjustedSignalDelta = clamp((signalDelta + adjustment) * volatilityMultiplier, -0.75, 0.75);

  if (volatilityMultiplier < 1) {
    reasons.push("high_recent_volatility");
  }

  return {
    signalDelta: adjustedSignalDelta,
    adjustment: adjustedSignalDelta - signalDelta,
    rawAdjustment: adjustment,
    volatilityMultiplier,
    reasons,
    priceTrend
  };
}

function calculateArtistUpdate({
  artist,
  index,
  runDate,
  source,
  modelVersion,
  manualSignals,
  adapterSignals
}: {
  artist: MarketUpdateArtist;
  index: number;
  runDate: string;
  source: MarketUpdateSource;
  modelVersion: string;
  manualSignals?: ManualSignals;
  adapterSignals?: AdapterSignals;
}): ArtistMarketUpdate {
  const signals = getSignalsForArtist(artist, index, runDate, source, manualSignals, adapterSignals);
  const decayedExistingStats = decayStatsTowardNeutral(artist.stats);
  const stats = signals.hasMomentumSignal ? blendStats(decayedExistingStats, signals.stats) : decayedExistingStats;
  const staleMomentumDecayDelta = signals.hasMomentumSignal ? 0 : getStaleMomentumDecayDelta(artist.stats, source);
  const conflictMoveMultiplier = getConflictMoveMultiplier(signals.reliabilityDetails);
  const rawSignalDelta = signals.hasMomentumSignal
    ? calculateSignalDelta(stats) * artist.volatility
    : staleMomentumDecayDelta * artist.volatility;
  const reliabilityMultiplier = signals.hasMomentumSignal ? getReliabilityPriceMultiplier(signals.reliability) : 0;
  const reliabilityAdjustedDelta = rawSignalDelta * reliabilityMultiplier;
  const modifierImpact = signals.hasMomentumSignal
    ? applySignalModifiers(reliabilityAdjustedDelta * conflictMoveMultiplier, signals.modifiers, reliabilityMultiplier)
    : getEmptyModifierImpact(rawSignalDelta);
  const signalDeltaBeforeTechnicals = modifierImpact.signalDelta;
  const technicalAdjustment = applyTechnicalPriceContext({
    signalDelta: signalDeltaBeforeTechnicals,
    priceTrend: artist.priceTrend,
    hasMomentumSignal: signals.hasMomentumSignal,
    reliability: signals.reliability
  });
  const signalDelta = technicalAdjustment.signalDelta;
  const previousClose = getValidPrice(artist.previousClose, artist.currentPrice);
  const categoryDailyCap = getCategoryDailyCap(artist.category);
  const dailyCap = getEffectiveDailyCap({
    categoryDailyCap,
    reliability: signals.reliability,
    conflictMoveMultiplier,
    hasMomentumSignal: signals.hasMomentumSignal
  });
  const targetPrice = artist.currentPrice * (1 + signalDelta);
  const blendedPrice = artist.currentPrice * 0.8 + targetPrice * 0.2;
  const cappedPrice = clamp(
    blendedPrice,
    previousClose * (1 - dailyCap),
    previousClose * (1 + dailyCap)
  );
  const currentPrice = roundPrice(cappedPrice);
  const dailyChangePercent = getDailyChangePercent(currentPrice, previousClose);
  const hypeScore = calculateHypeScore(stats);
  const catalystDiagnostics = buildCatalystDiagnostics(signals.modifiers, dailyChangePercent);
  const sourceAttribution = buildSourceAttribution(signals.rawPayload, dailyChangePercent);

  return {
    artistId: artist.id,
    ticker: artist.ticker,
    previousClose,
    oldPrice: artist.currentPrice,
    currentPrice,
    dailyChangePercent,
    hypeScore,
    stats,
    explanation: signals.hasMomentumSignal
      ? explainMove(artist.ticker, stats, dailyChangePercent, catalystDiagnostics)
      : explainNoSignalMove(artist.ticker, source, dailyChangePercent, staleMomentumDecayDelta),
    signalDelta,
    modelVersion,
    rawPayload: {
      ...signals.rawPayload,
      modelVersion,
      hasMomentumSignal: signals.hasMomentumSignal,
      signalReliability: signals.reliability,
      reliabilityMultiplier,
      reliabilityDetails: signals.reliabilityDetails,
      conflictMoveMultiplier,
      decayedExistingStats,
      staleMomentumDecayDelta,
      rawSignalDelta,
      reliabilityAdjustedDelta,
      modifierImpact,
      signalDeltaBeforeTechnicals,
      technicalAdjustment,
      catalystDiagnostics,
      sourceAttribution,
      previousClose,
      previousCloseSource: artist.previousCloseSource ?? "artist",
      oldPrice: artist.currentPrice,
      categoryDailyCap,
      dailyCap,
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
    source === "wikimedia" ||
    source === "reddit" ||
    source === "bluesky" ||
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

function isRealExternalSource(source: MarketUpdateSource) {
  return (
    source === "gdelt" ||
    source === "lastfm" ||
    source === "spotify" ||
    source === "youtube" ||
    source === "wikimedia" ||
    source === "reddit" ||
    source === "bluesky" ||
    source === "core" ||
    source === "blended"
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

function decayStatsTowardNeutral(stats: HypeStats): HypeStats {
  return {
    streamingGrowth: decayToward(stats.streamingGrowth, 0, 0.18, -25, 75),
    youtubeGrowth: decayToward(stats.youtubeGrowth, 0, 0.18, -25, 70),
    searchGrowth: decayToward(stats.searchGrowth, 0, 0.16, -30, 95),
    socialGrowth: decayToward(stats.socialGrowth, 0, 0.16, -35, 120),
    newsScore: decayToward(stats.newsScore, 50, 0.22, 0, 100),
    traderDemand: decayToward(stats.traderDemand, 0, 0.28, -40, 40)
  };
}

function getStaleMomentumDecayDelta(stats: HypeStats, source: MarketUpdateSource) {
  if (!isRealExternalSource(source)) {
    return 0;
  }

  const staleSignalDelta = calculateSignalDelta(stats);

  if (staleSignalDelta <= 0.01) {
    return 0;
  }

  return -clamp(staleSignalDelta * 0.16, 0.001, 0.01);
}

function decayToward(value: number, neutral: number, rate: number, min: number, max: number) {
  return clamp(value + (neutral - value) * rate, min, max);
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

function applySignalModifiers(signalDelta: number, modifiers: MarketSignalModifier[], reliabilityMultiplier = 1) {
  const modifierAudits = buildModifierAudits(modifiers);
  const combinedMultiplier = modifiers.reduce(
    (value, modifier) =>
      typeof modifier.priceMultiplier === "number" ? value * modifier.priceMultiplier : value,
    1
  );
  const positivePriceShock = modifiers.reduce(
    (value, modifier) => value + Math.max(0, modifier.priceShock ?? 0) * reliabilityMultiplier,
    0
  );
  const negativePriceShock = modifiers.reduce(
    (value, modifier) => value + Math.min(0, modifier.priceShock ?? 0) * reliabilityMultiplier,
    0
  );
  const combinedShock = modifiers.reduce(
    (value, modifier) => value + (modifier.priceShock ?? 0) * reliabilityMultiplier,
    0
  );
  const adjustedSignalDelta = clamp(
    (signalDelta + combinedShock) * combinedMultiplier,
    -0.75,
    0.75
  );

  return {
    signalDelta: adjustedSignalDelta,
    baseSignalDelta: signalDelta,
    combinedMultiplier,
    combinedShock,
    positivePriceShock,
    negativePriceShock,
    appliedDelta: adjustedSignalDelta - signalDelta,
    modifierCount: modifiers.length,
    topModifiers: modifierAudits.slice(0, 5)
  };
}

function getEmptyModifierImpact(signalDelta: number) {
  return {
    signalDelta,
    baseSignalDelta: signalDelta,
    combinedMultiplier: 1,
    combinedShock: 0,
    positivePriceShock: 0,
    negativePriceShock: 0,
    appliedDelta: 0,
    modifierCount: 0,
    topModifiers: []
  };
}

function buildModifierAudits(modifiers: MarketSignalModifier[]): ModifierAudit[] {
  return modifiers
    .map((modifier) => {
      const priceShock = typeof modifier.priceShock === "number" && Number.isFinite(modifier.priceShock)
        ? modifier.priceShock
        : 0;
      const score = typeof modifier.score === "number" && Number.isFinite(modifier.score)
        ? modifier.score
        : null;
      const reasonPriority = clamp(modifier.reasonPriority ?? 0, 0, 20);

      return {
        reason: modifier.reason,
        direction: priceShock > 0 ? "positive" : priceShock < 0 ? "negative" : "neutral",
        priceShock,
        priceMultiplier: typeof modifier.priceMultiplier === "number" && Number.isFinite(modifier.priceMultiplier)
          ? modifier.priceMultiplier
          : null,
        score,
        reasonPriority,
        sortScore: getModifierSortScore(modifier)
      } satisfies ModifierAudit;
    })
    .sort((a, b) => b.sortScore - a.sortScore);
}

export function mergeAdapterSignals(...sources: Array<AdapterSignals | undefined>) {
  const buckets: Record<
    string,
    {
      stats: Partial<Record<keyof HypeStats, { total: number; weight: number }>>;
      rawPayload: Record<string, unknown>;
      modifiers: MarketSignalModifier[];
      sourceWeights: Record<string, Record<string, number>>;
      sourceValues: Record<string, Partial<Record<keyof HypeStats, number>>>;
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
        sourceWeights: {},
        sourceValues: {}
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
        bucket.sourceValues[sourceName] ??= {};
        bucket.sourceValues[sourceName][key] = value;
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
          sourceWeights: bucket.sourceWeights,
          sourceValues: bucket.sourceValues,
          sourceDirectionalScores: buildSourceDirectionalScores(bucket.sourceValues, bucket.sourceWeights)
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

function buildSourceDirectionalScores(
  sourceValues: Record<string, Partial<Record<keyof HypeStats, number>>>,
  sourceWeights: Record<string, Record<string, number>>
) {
  return Object.fromEntries(
    Object.entries(sourceValues)
      .map(([sourceName, values]) => {
        let total = 0;
        let weightTotal = 0;

        for (const key of getHypeStatKeys()) {
          const value = values[key];

          if (typeof value !== "number") {
            continue;
          }

          const weight = sourceWeights[sourceName]?.[key] ?? getStatSourceWeight(key, sourceName);
          total += getDirectionalStatValue(key, value) * weight;
          weightTotal += weight;
        }

        if (weightTotal <= 0) {
          return null;
        }

        return [sourceName, total / weightTotal] as const;
      })
      .filter((item): item is readonly [string, number] => Boolean(item))
  );
}

function getSignalSourceName(signal: AdapterSignal) {
  const source = signal.rawPayload.source;

  return typeof source === "string" && source ? source : "adapter";
}

function getSignalConfidence(signal: AdapterSignal, sourceName: string) {
  if (typeof signal.confidence === "number" && Number.isFinite(signal.confidence)) {
    return clamp(signal.confidence, 0, 1);
  }

  return getDefaultSignalConfidence(sourceName);
}

function getDefaultSignalConfidence(sourceName: string) {
  const defaults: Record<string, number> = {
    lastfm: 0.86,
    youtube: 0.84,
    youtube_comments: 0.68,
    reddit: 0.64,
    bluesky: 0.58,
    spotify: 0.7,
    gdelt: 0.58,
    wikimedia: 0.62,
    market_events: 0.78,
    trade_flow: 0.72,
    manual: 0.62,
    core: 0.68,
    blended: 0.68,
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
    reddit: {
      socialGrowth: 0.88,
      searchGrowth: 0.55,
      newsScore: 0.48
    },
    bluesky: {
      socialGrowth: 0.78,
      searchGrowth: 0.48,
      newsScore: 0.42
    },
    gdelt: {
      searchGrowth: 0.75,
      socialGrowth: 0.4,
      newsScore: 0.7
    },
    wikimedia: {
      searchGrowth: 0.72,
      socialGrowth: 0.32,
      newsScore: 0.52
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

function getDirectionalStatValue(key: keyof HypeStats, value: number) {
  if (key === "newsScore") {
    return value - 50;
  }

  return value;
}

function buildExplicitSignal(
  existing: HypeStats,
  incoming: Partial<HypeStats>,
  rawPayload: Record<string, unknown>,
  modifiers: MarketSignalModifier[] = [],
  fallback: "existing" | "neutral" = "existing"
): ResolvedMarketSignal {
  const base = fallback === "neutral" ? getNeutralStats() : existing;
  const reliability = calculateSignalReliability(incoming, rawPayload, modifiers);

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
    hasMomentumSignal: hasPartialStats(incoming) || modifiers.length > 0,
    reliability: reliability.score,
    reliabilityDetails: reliability.details
  };
}

function calculateSignalReliability(
  incoming: Partial<HypeStats>,
  rawPayload: Record<string, unknown>,
  modifiers: MarketSignalModifier[]
) {
  const statCount = getHypeStatKeys().filter((key) => typeof incoming[key] === "number").length;
  const sourceWeights = getSourceWeights(rawPayload);
  const sourceNames = sourceWeights ? Object.keys(sourceWeights) : [getPayloadSourceName(rawPayload)].filter(Boolean);
  const flattenedWeights = sourceWeights
    ? Object.values(sourceWeights).flatMap((weights) => Object.values(weights).filter(isFiniteNumber))
    : [];
  const averageSourceWeight = flattenedWeights.length
    ? flattenedWeights.reduce((total, value) => total + value, 0) / flattenedWeights.length
    : getDefaultSignalConfidence(sourceNames[0] ?? "adapter");
  const sourceBreadthScore = clamp(sourceNames.length / 4, 0.2, 1);
  const statCoverageScore = clamp(statCount / 4, 0.2, 1);
  const eventSupportScore = modifiers.length > 0 ? 0.16 : 0;
  const sourceConflict = getSourceConflictDiagnostics(rawPayload);
  const dataQuality = getDataQualityDiagnostics(rawPayload);
  const rawScore = clamp(
    averageSourceWeight * 0.5 + sourceBreadthScore * 0.24 + statCoverageScore * 0.2 + eventSupportScore,
    0.18,
    1
  );
  const consensusCap = getConsensusReliabilityCap({
    sourceCount: sourceNames.length,
    statCount,
    hasEventSupport: modifiers.length > 0
  });
  const conflictAdjustedScore = rawScore * sourceConflict.conflictMultiplier * dataQuality.confidenceMultiplier;
  const score = clamp(Math.min(conflictAdjustedScore, consensusCap), 0.18, 1);

  return {
    score,
    details: {
      sourceCount: sourceNames.length,
      statCount,
      averageSourceWeight,
      sourceBreadthScore,
      statCoverageScore,
      eventSupportScore,
      rawScore,
      consensusCap,
      conflictAdjustedScore,
      sourceQualityMultiplier: dataQuality.confidenceMultiplier,
      sourceQualityAnomalyCount: dataQuality.anomalyCount,
      sourceQualityStaleCount: dataQuality.staleCount,
      sourceQualityMissingBaselineCount: dataQuality.missingBaselineCount,
      sourceQualityFlags: dataQuality.flags,
      sourceConflictMultiplier: sourceConflict.conflictMultiplier,
      positiveSourceCount: sourceConflict.positiveSourceCount,
      negativeSourceCount: sourceConflict.negativeSourceCount,
      neutralSourceCount: sourceConflict.neutralSourceCount,
      sourceDirectionSpread: sourceConflict.spread,
      sourceDirectionalScores: sourceConflict.scores
    }
  };
}

function getDataQualityDiagnostics(rawPayload: Record<string, unknown>) {
  const qualityObjects = collectMomentumQualityObjects(rawPayload);
  const flags = new Set<string>();
  let multiplierTotal = 0;
  let multiplierCount = 0;
  let anomalyCount = 0;
  let staleCount = 0;
  let missingBaselineCount = 0;

  for (const quality of qualityObjects) {
    const confidenceMultiplier = getNumber(quality.confidenceMultiplier, Number.NaN);

    if (Number.isFinite(confidenceMultiplier)) {
      multiplierTotal += confidenceMultiplier;
      multiplierCount += 1;
    }

    const baselineAgeDays = getNumber(quality.baselineAgeDays, 0);

    if (baselineAgeDays >= 14) {
      staleCount += 1;
      flags.add("stale_baseline");
    }

    const anomalyFlags = Array.isArray(quality.anomalyFlags)
      ? quality.anomalyFlags.filter((value): value is string => typeof value === "string")
      : [];

    for (const flag of anomalyFlags) {
      flags.add(flag);

      if (flag === "missing_baseline") {
        missingBaselineCount += 1;
      } else {
        anomalyCount += 1;
      }
    }
  }

  const averageMultiplier = multiplierCount > 0 ? multiplierTotal / multiplierCount : 1;
  const missingBaselinePenalty = missingBaselineCount > 0 && missingBaselineCount === qualityObjects.length ? 0.72 : 1;

  return {
    confidenceMultiplier: clamp(averageMultiplier * missingBaselinePenalty, 0.45, 1),
    anomalyCount,
    staleCount,
    missingBaselineCount,
    flags: Array.from(flags).sort()
  };
}

function collectMomentumQualityObjects(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const object = value as Record<string, unknown>;
  const isQualityObject =
    Array.isArray(object.anomalyFlags) ||
    typeof object.confidenceMultiplier === "number" ||
    typeof object.baselineAgeFactor === "number";
  const nested = Object.values(object).flatMap((child) => collectMomentumQualityObjects(child));

  return isQualityObject ? [object, ...nested] : nested;
}

function getConsensusReliabilityCap({
  sourceCount,
  statCount,
  hasEventSupport
}: {
  sourceCount: number;
  statCount: number;
  hasEventSupport: boolean;
}) {
  const baseCap =
    sourceCount >= 4
      ? 1
      : sourceCount === 3
        ? 0.92
        : sourceCount === 2
          ? 0.82
          : sourceCount === 1
            ? 0.64
            : 0.42;
  const statBreadthLift = statCount >= 4 ? 0.04 : statCount >= 3 ? 0.025 : 0;
  const eventLift = hasEventSupport ? 0.08 : 0;

  return clamp(baseCap + statBreadthLift + eventLift, 0.35, 1);
}

function getSourceConflictDiagnostics(rawPayload: Record<string, unknown>) {
  const scores = getSourceDirectionalScores(rawPayload);
  const values = Object.values(scores);

  if (values.length < 2) {
    return {
      scores,
      positiveSourceCount: values.filter((value) => value >= 8).length,
      negativeSourceCount: values.filter((value) => value <= -8).length,
      neutralSourceCount: values.filter((value) => value > -8 && value < 8).length,
      spread: 0,
      conflictMultiplier: 1
    };
  }

  const positiveSourceCount = values.filter((value) => value >= 8).length;
  const negativeSourceCount = values.filter((value) => value <= -8).length;
  const neutralSourceCount = values.length - positiveSourceCount - negativeSourceCount;
  const spread = Math.max(...values) - Math.min(...values);
  const hasConflict = positiveSourceCount > 0 && negativeSourceCount > 0;
  const disagreementPenalty = hasConflict
    ? clamp(Math.min(positiveSourceCount, negativeSourceCount) * 0.12 + spread / 360, 0.12, 0.42)
    : 0;

  return {
    scores,
    positiveSourceCount,
    negativeSourceCount,
    neutralSourceCount,
    spread,
    conflictMultiplier: 1 - disagreementPenalty
  };
}

function getSourceDirectionalScores(rawPayload: Record<string, unknown>) {
  const value = rawPayload.sourceDirectionalScores;

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, score]) => [key, typeof score === "number" && Number.isFinite(score) ? score : null] as const)
      .filter((entry): entry is readonly [string, number] => typeof entry[1] === "number")
  );
}

function buildSourceAttribution(
  rawPayload: Record<string, unknown>,
  dailyChangePercent: number
): SourceAttribution {
  const scores = getSourceDirectionalScores(rawPayload);
  const sourceWeights = getSourceWeights(rawPayload) ?? {};
  const moveDirection = dailyChangePercent >= 0 ? "positive" : "negative";
  const sources = Object.entries(scores)
    .map(([source, score]) => {
      const weights = sourceWeights[source] ?? {};
      const statCount = Object.keys(weights).length;
      const totalWeight = Object.values(weights).reduce(
        (total, value) => total + (typeof value === "number" && Number.isFinite(value) ? value : 0),
        0
      );
      const direction = score >= 8 ? "positive" : score <= -8 ? "negative" : "neutral";

      return {
        source,
        label: getSourceAttributionLabel(source),
        direction,
        score,
        statCount,
        totalWeight,
        alignedWithMove: direction === moveDirection
      } satisfies SourceAttributionItem;
    })
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
  const positiveSources = sources.filter((source) => source.direction === "positive");
  const negativeSources = sources.filter((source) => source.direction === "negative");
  const neutralSources = sources.filter((source) => source.direction === "neutral");
  const leadingSource = sources.find((source) => source.direction === moveDirection) ?? sources[0] ?? null;
  const opposingSource = sources.find(
    (source) => source.direction !== "neutral" && source.direction !== moveDirection
  ) ?? null;
  const values = sources.map((source) => source.score);

  return {
    sourceCount: sources.length,
    positiveSourceCount: positiveSources.length,
    negativeSourceCount: negativeSources.length,
    neutralSourceCount: neutralSources.length,
    leadingSource,
    opposingSource,
    sourceSpread: values.length >= 2 ? Math.max(...values) - Math.min(...values) : 0,
    sources
  };
}

function getSourceAttributionLabel(source: string) {
  const labels: Record<string, string> = {
    lastfm: "audience listening",
    spotify: "streaming platform",
    youtube: "video platform",
    youtube_comments: "video comment sentiment",
    youtube_uploads: "official upload activity",
    reddit: "community discussion",
    bluesky: "social chatter",
    gdelt: "news coverage",
    wikimedia: "public attention",
    market_events: "release and news events",
    trade_flow: "order flow",
    manual: "manual signal"
  };

  return labels[source] ?? source.replace(/_/g, " ");
}

function getPayloadSourceName(rawPayload: Record<string, unknown>) {
  const source = rawPayload.source;

  if (typeof source === "string" && source) {
    return source;
  }

  const adapter = rawPayload.adapter;

  if (adapter && typeof adapter === "object" && !Array.isArray(adapter)) {
    const adapterSource = (adapter as Record<string, unknown>).source;
    return typeof adapterSource === "string" ? adapterSource : "";
  }

  return "";
}

function getReliabilityPriceMultiplier(reliability: number) {
  return clamp(0.25 + reliability * 0.75, 0.25, 1);
}

function getConflictMoveMultiplier(details: Record<string, unknown>) {
  const positiveSourceCount = getNumber(details.positiveSourceCount, 0);
  const negativeSourceCount = getNumber(details.negativeSourceCount, 0);
  const conflictMultiplier = getNumber(details.sourceConflictMultiplier, 1);

  if (positiveSourceCount <= 0 || negativeSourceCount <= 0) {
    return 1;
  }

  return clamp(conflictMultiplier, 0.55, 1);
}

function getEffectiveDailyCap({
  categoryDailyCap,
  reliability,
  conflictMoveMultiplier,
  hasMomentumSignal
}: {
  categoryDailyCap: number;
  reliability: number;
  conflictMoveMultiplier: number;
  hasMomentumSignal: boolean;
}) {
  if (!hasMomentumSignal) {
    return Math.min(categoryDailyCap, 0.025);
  }

  return clamp(categoryDailyCap * (0.32 + reliability * 0.68) * conflictMoveMultiplier, 0.018, categoryDailyCap);
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
  catalystDiagnostics: CatalystDiagnostics
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
  const primaryCatalyst = catalystDiagnostics.primaryCatalyst;
  const counterCatalyst = catalystDiagnostics.counterCatalyst;

  if (primaryCatalyst) {
    const counterClause = getCounterCatalystClause({
      dailyChangePercent,
      counterCatalyst
    });

    if (primaryCatalyst.reasonPriority >= 8) {
      return `${ticker} ${direction} with ${primaryCatalyst.reason} as the strongest detected catalyst${counterClause}.`;
    }

    return `${ticker} ${direction} as ${signalName} led the daily model, with ${primaryCatalyst.reason} also affecting the move${counterClause}.`;
  }

  if (counterCatalyst?.reasonPriority && counterCatalyst.reasonPriority >= 8) {
    return `${ticker} ${direction} as ${signalName} led the daily model, though ${counterCatalyst.reason} limited the move.`;
  }

  return `${ticker} ${direction} as ${signalName} led the daily model.`;
}

function buildCatalystDiagnostics(
  modifiers: MarketSignalModifier[],
  dailyChangePercent: number
): CatalystDiagnostics {
  const topCatalysts = buildModifierAudits(modifiers);
  const positiveCatalysts = topCatalysts.filter((modifier) => modifier.direction === "positive");
  const negativeCatalysts = topCatalysts.filter((modifier) => modifier.direction === "negative");
  const primaryDirection = dailyChangePercent >= 0 ? "positive" : "negative";
  const counterDirection = primaryDirection === "positive" ? "negative" : "positive";
  const primaryCatalyst = topCatalysts.find((modifier) => modifier.direction === primaryDirection) ?? null;
  const counterCatalyst = topCatalysts.find((modifier) => modifier.direction === counterDirection) ?? null;
  const positivePriceShock = positiveCatalysts.reduce((total, modifier) => total + modifier.priceShock, 0);
  const negativePriceShock = negativeCatalysts.reduce((total, modifier) => total + modifier.priceShock, 0);

  return {
    modifierCount: topCatalysts.length,
    positiveCatalystCount: positiveCatalysts.length,
    negativeCatalystCount: negativeCatalysts.length,
    highPriorityCatalystCount: topCatalysts.filter((modifier) => modifier.reasonPriority >= 8).length,
    positivePriceShock,
    negativePriceShock,
    netPriceShock: positivePriceShock + negativePriceShock,
    primaryCatalyst,
    counterCatalyst,
    topCatalysts: topCatalysts.slice(0, 8)
  };
}

function getCounterCatalystClause({
  dailyChangePercent,
  counterCatalyst
}: {
  dailyChangePercent: number;
  counterCatalyst: ModifierAudit | null;
}) {
  if (!counterCatalyst || counterCatalyst.reasonPriority < 8 || Math.abs(counterCatalyst.priceShock) < 0.004) {
    return "";
  }

  if (dailyChangePercent >= 0 && counterCatalyst.priceShock < 0) {
    return `, though ${counterCatalyst.reason} limited the move`;
  }

  if (dailyChangePercent < 0 && counterCatalyst.priceShock > 0) {
    return `, though ${counterCatalyst.reason} softened the pullback`;
  }

  return "";
}

function getModifierSortScore(modifier: MarketSignalModifier) {
  const rawScore = Math.abs(modifier.score ?? 0);
  const priority = clamp(modifier.reasonPriority ?? 0, 0, 20);
  const priceShock = Math.abs(modifier.priceShock ?? 0);

  return rawScore * (1 + priority / 8) + priceShock * 900 + priority * 2.5;
}

function explainNoSignalMove(
  ticker: string,
  source: MarketUpdateSource,
  dailyChangePercent: number,
  staleMomentumDecayDelta: number
) {
  if (staleMomentumDecayDelta < 0 || dailyChangePercent < -0.01) {
    return `${ticker} pulled back as prior hype decayed without a fresh confirming signal.`;
  }

  if (
    source === "gdelt" ||
    source === "lastfm" ||
    source === "spotify" ||
    source === "youtube" ||
    source === "wikimedia" ||
    source === "reddit" ||
    source === "bluesky" ||
    source === "core" ||
    source === "blended"
  ) {
    return `${ticker} held flat while the market collected baseline data without a confirmed momentum signal.`;
  }

  return `${ticker} held flat with no confirmed daily momentum signal.`;
}

function explainRelativeMove(ticker: string, dailyChangePercent: number, hasMomentumSignal: boolean) {
  if (dailyChangePercent < 0 && hasMomentumSignal) {
    return `${ticker} pulled back as its signals lagged the day's market momentum.`;
  }

  if (dailyChangePercent < 0) {
    return `${ticker} drifted lower as stronger momentum elsewhere created relative market pressure.`;
  }

  return `${ticker} moved as the market repriced relative momentum across active artists.`;
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

function getMedian(sortedValues: number[]) {
  if (!sortedValues.length) {
    return 0;
  }

  const midpoint = Math.floor(sortedValues.length / 2);

  if (sortedValues.length % 2 === 1) {
    return sortedValues[midpoint] ?? 0;
  }

  return ((sortedValues[midpoint - 1] ?? 0) + (sortedValues[midpoint] ?? 0)) / 2;
}

function getPercentileRank(value: number, sortedValues: number[]) {
  if (sortedValues.length <= 1) {
    return 0.5;
  }

  const lowerCount = sortedValues.filter((item) => item < value).length;
  const equalCount = sortedValues.filter((item) => item === value).length;

  return clamp((lowerCount + equalCount / 2) / sortedValues.length, 0, 1);
}

function getMarketContextConfidence(marketCoverageRatio: number) {
  if (!Number.isFinite(marketCoverageRatio) || marketCoverageRatio <= 0) {
    return 0.2;
  }

  return clamp(marketCoverageRatio, 0.2, 1);
}

function hashToUnit(input: string) {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 4294967295;
}

function getNumber(value: unknown, fallback: number) {
  return isFiniteNumber(value) ? value : fallback;
}

function getValidPrice(value: number, fallback: number) {
  return isFiniteNumber(value) && value > 0 ? value : fallback;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
