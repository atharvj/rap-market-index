import type { SupabaseClient } from "@supabase/supabase-js";
import { clamp } from "@/lib/pricing";
import type { Database } from "@/lib/supabase/database.types";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
import { getPacificMarketLookbackBoundsUtc } from "@/server/market/market-date";
import type { AdapterSignals, MarketObservation } from "@/server/market/market-data";
import type { HypeStats } from "@/lib/types";

type Supabase = SupabaseClient<Database>;

type TradeFlowCollectOptions = {
  supabase: Supabase;
  artists: MarketUpdateArtist[];
  runDate: string;
  lookbackDays?: number;
};

type TradeRow = Pick<
  Database["public"]["Tables"]["transactions"]["Row"],
  "artist_id" | "user_id" | "type" | "shares" | "price" | "cash_delta" | "gross_value" | "market_eligible" | "created_at"
>;

type TradeBucket = {
  buyValue: number;
  sellValue: number;
  buyCount: number;
  sellCount: number;
  sharesBought: number;
  sharesSold: number;
  traders: Set<string>;
  traderValues: Map<string, number>;
};

export type TradeFlowMarketSignals = {
  signals: AdapterSignals;
  observations: MarketObservation[];
  warnings: string[];
};

const SOURCE = "trade_flow";
const BUY_VALUE = "buy_value";
const SELL_VALUE = "sell_value";
const NET_ORDER_VALUE = "net_order_value";
const GROSS_ORDER_VALUE = "gross_order_value";
const TRADE_COUNT = "trade_count";
const UNIQUE_TRADER_COUNT = "unique_trader_count";
const LARGEST_TRADER_SHARE = "largest_trader_share";
const BREADTH_MULTIPLIER = "breadth_multiplier";
const CONCENTRATION_PENALTY = "concentration_penalty";
const SIGNAL_ELIGIBILITY = "signal_eligibility";
const MAX_TRADE_ROWS = 10000;
const MIN_SIGNAL_TRADERS = 3;
const MIN_SIGNAL_GROSS_ORDER_VALUE = 1000;
const MAX_SIGNAL_LARGEST_TRADER_SHARE = 0.7;

export async function collectTradeFlowMarketSignals({
  supabase,
  artists,
  runDate,
  lookbackDays = 1
}: TradeFlowCollectOptions): Promise<TradeFlowMarketSignals> {
  if (!artists.length) {
    return {
      signals: {},
      observations: [],
      warnings: []
    };
  }

  const artistIds = artists.map((artist) => artist.id);
  const { start: windowStart, end: windowEnd } = getPacificMarketLookbackBoundsUtc(runDate, lookbackDays);
  const { data, error } = await supabase
    .from("transactions")
    .select("artist_id,user_id,type,shares,price,cash_delta,gross_value,market_eligible,created_at")
    .in("artist_id", artistIds)
    .eq("market_eligible", true)
    .gte("created_at", windowStart)
    .lt("created_at", windowEnd)
    .order("created_at", { ascending: false })
    .limit(MAX_TRADE_ROWS);

  if (error) {
    throw new Error(`Could not load trade flow: ${error.message}`);
  }

  const buckets = groupTrades((data ?? []) as TradeRow[]);
  const artistsById = new Map(artists.map((artist) => [artist.id, artist]));
  const signals: AdapterSignals = {};
  const observations: MarketObservation[] = [];
  let suppressedSignalCount = 0;

  for (const [artistId, bucket] of buckets) {
    const artist = artistsById.get(artistId);

    if (!artist) {
      continue;
    }

    const signal = buildTradeFlowSignal({
      artist,
      bucket,
      runDate,
      windowStart,
      windowEnd
    });

    signals[artistId] = signal.signal;
    observations.push(...signal.observations);
    suppressedSignalCount += signal.suppressed ? 1 : 0;
  }

  const warnings: string[] = [];

  if ((data?.length ?? 0) >= MAX_TRADE_ROWS) {
    warnings.push("Trade-flow signal hit the row cap; add a SQL aggregate before scaling trading volume further.");
  }

  if (suppressedSignalCount > 0) {
    warnings.push(
      `Suppressed ${suppressedSignalCount} thin or concentrated trade-flow signal${suppressedSignalCount === 1 ? "" : "s"} from the pricing model.`
    );
  }

  return {
    signals,
    observations,
    warnings
  };
}

function groupTrades(trades: TradeRow[]) {
  return trades.reduce<Map<string, TradeBucket>>((grouped, trade) => {
    const bucket =
      grouped.get(trade.artist_id) ??
      {
        buyValue: 0,
        sellValue: 0,
        buyCount: 0,
        sellCount: 0,
        sharesBought: 0,
        sharesSold: 0,
        traders: new Set<string>(),
        traderValues: new Map<string, number>()
      };
    const orderValue = Number(trade.gross_value) || Math.abs(Number(trade.cash_delta));
    const shares = Number(trade.shares);

    if (trade.type === "buy") {
      bucket.buyValue += orderValue;
      bucket.buyCount += 1;
      bucket.sharesBought += shares;
    } else {
      bucket.sellValue += orderValue;
      bucket.sellCount += 1;
      bucket.sharesSold += shares;
    }

    bucket.traders.add(trade.user_id);
    bucket.traderValues.set(trade.user_id, (bucket.traderValues.get(trade.user_id) ?? 0) + orderValue);
    grouped.set(trade.artist_id, bucket);
    return grouped;
  }, new Map<string, TradeBucket>());
}

function buildTradeFlowSignal({
  artist,
  bucket,
  runDate,
  windowStart,
  windowEnd
}: {
  artist: MarketUpdateArtist;
  bucket: TradeBucket;
  runDate: string;
  windowStart: string;
  windowEnd: string;
}) {
  const netOrderValue = bucket.buyValue - bucket.sellValue;
  const grossOrderValue = bucket.buyValue + bucket.sellValue;
  const tradeCount = bucket.buyCount + bucket.sellCount;
  const uniqueTraderCount = bucket.traders.size;
  const valueImbalance = grossOrderValue > 0 ? netOrderValue / grossOrderValue : 0;
  const countImbalance = tradeCount > 0 ? (bucket.buyCount - bucket.sellCount) / tradeCount : 0;
  const largestTraderValue = getLargestTraderValue(bucket.traderValues);
  const largestTraderShare = grossOrderValue > 0 ? largestTraderValue / grossOrderValue : 0;
  const activityScale = clamp(Math.log10(grossOrderValue + 1) / 4, 0.12, 1);
  const traderBreadth = clamp(uniqueTraderCount / 20, 0, 1);
  const breadthMultiplier = getBreadthMultiplier(uniqueTraderCount);
  const concentrationPenalty = getConcentrationPenalty(largestTraderShare);
  const reliabilityMultiplier = breadthMultiplier * concentrationPenalty;
  const eligibility = getSignalEligibility({
    grossOrderValue,
    uniqueTraderCount,
    largestTraderShare
  });
  const rawTraderDemand = clamp((valueImbalance * 30 + countImbalance * 10) * (0.62 + activityScale * 0.28 + traderBreadth * 0.1), -40, 40);
  const traderDemand = eligibility.eligible ? clamp(rawTraderDemand * reliabilityMultiplier, -28, 28) : 0;
  const stats: Partial<HypeStats> = eligibility.eligible ? { traderDemand } : {};
  const rawPayload = {
    source: SOURCE,
    runDate,
    windowStart,
    windowEnd,
    status: "ok",
    buyValue: round(bucket.buyValue),
    sellValue: round(bucket.sellValue),
    netOrderValue: round(netOrderValue),
    grossOrderValue: round(grossOrderValue),
    buyCount: bucket.buyCount,
    sellCount: bucket.sellCount,
    tradeCount,
    uniqueTraderCount,
    largestTraderValue: round(largestTraderValue),
    largestTraderShare,
    sharesBought: round(bucket.sharesBought),
    sharesSold: round(bucket.sharesSold),
    valueImbalance,
    countImbalance,
    activityScale,
    traderBreadth,
    breadthMultiplier,
    concentrationPenalty,
    reliabilityMultiplier,
    signalEligible: eligibility.eligible,
    signalEligibilityReason: eligibility.reason,
    rawTraderDemand,
    traderDemand,
    currentPrice: artist.currentPrice
  };

  return {
    signal: {
      stats,
      confidence: getConfidence({
        tradeCount,
        grossOrderValue,
        uniqueTraderCount,
        reliabilityMultiplier
      }),
      rawPayload
    },
    observations: [
      createObservation(artist.id, runDate, BUY_VALUE, bucket.buyValue, "cash", rawPayload),
      createObservation(artist.id, runDate, SELL_VALUE, bucket.sellValue, "cash", rawPayload),
      createObservation(artist.id, runDate, NET_ORDER_VALUE, netOrderValue, "cash", rawPayload),
      createObservation(artist.id, runDate, GROSS_ORDER_VALUE, grossOrderValue, "cash", rawPayload),
      createObservation(artist.id, runDate, TRADE_COUNT, tradeCount, "trades", rawPayload),
      createObservation(artist.id, runDate, UNIQUE_TRADER_COUNT, uniqueTraderCount, "traders", rawPayload),
      createObservation(artist.id, runDate, LARGEST_TRADER_SHARE, largestTraderShare, "ratio", rawPayload),
      createObservation(artist.id, runDate, BREADTH_MULTIPLIER, breadthMultiplier, "ratio", rawPayload),
      createObservation(artist.id, runDate, CONCENTRATION_PENALTY, concentrationPenalty, "ratio", rawPayload),
      createObservation(artist.id, runDate, SIGNAL_ELIGIBILITY, eligibility.eligible ? 1 : 0, "boolean", rawPayload)
    ],
    suppressed: !eligibility.eligible
  };
}

function getLargestTraderValue(traderValues: Map<string, number>) {
  return Array.from(traderValues.values()).reduce((largest, value) => Math.max(largest, value), 0);
}

function getBreadthMultiplier(uniqueTraderCount: number) {
  if (uniqueTraderCount <= 1) {
    return 0.02;
  }

  if (uniqueTraderCount === 2) {
    return 0.1;
  }

  if (uniqueTraderCount <= 4) {
    return 0.32;
  }

  if (uniqueTraderCount <= 7) {
    return 0.68;
  }

  if (uniqueTraderCount <= 12) {
    return 0.84;
  }

  return 1;
}

function getConcentrationPenalty(largestTraderShare: number) {
  if (largestTraderShare <= 0.35) {
    return 1;
  }

  return clamp(1 - (largestTraderShare - 0.35) * 1.35, 0.06, 1);
}

function getSignalEligibility({
  grossOrderValue,
  uniqueTraderCount,
  largestTraderShare
}: {
  grossOrderValue: number;
  uniqueTraderCount: number;
  largestTraderShare: number;
}) {
  if (uniqueTraderCount < MIN_SIGNAL_TRADERS) {
    return {
      eligible: false,
      reason: "insufficient_trader_breadth"
    };
  }

  if (grossOrderValue < MIN_SIGNAL_GROSS_ORDER_VALUE) {
    return {
      eligible: false,
      reason: "insufficient_order_value"
    };
  }

  if (largestTraderShare > MAX_SIGNAL_LARGEST_TRADER_SHARE) {
    return {
      eligible: false,
      reason: "concentrated_order_flow"
    };
  }

  return {
    eligible: true,
    reason: "eligible"
  };
}

function getConfidence({
  tradeCount,
  grossOrderValue,
  uniqueTraderCount,
  reliabilityMultiplier
}: {
  tradeCount: number;
  grossOrderValue: number;
  uniqueTraderCount: number;
  reliabilityMultiplier: number;
}) {
  const baseConfidence =
    0.22 + Math.log10(tradeCount + 1) * 0.14 + Math.log10(grossOrderValue + 1) * 0.035 + Math.min(0.18, uniqueTraderCount * 0.02);

  return clamp(
    baseConfidence * (0.35 + reliabilityMultiplier * 0.65),
    0.16,
    0.82
  );
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

function round(value: number) {
  return Math.round(value * 100) / 100;
}
