import type { SupabaseClient } from "@supabase/supabase-js";
import { clamp } from "@/lib/pricing";
import type { Database } from "@/lib/supabase/database.types";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
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
  "artist_id" | "user_id" | "type" | "shares" | "price" | "cash_delta" | "created_at"
>;

type TradeBucket = {
  buyValue: number;
  sellValue: number;
  buyCount: number;
  sellCount: number;
  sharesBought: number;
  sharesSold: number;
  traders: Set<string>;
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
const MAX_TRADE_ROWS = 10000;

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
  const windowStart = `${shiftDate(runDate, -lookbackDays)}T00:00:00.000Z`;
  const windowEnd = `${runDate}T00:00:00.000Z`;
  const { data, error } = await supabase
    .from("transactions")
    .select("artist_id,user_id,type,shares,price,cash_delta,created_at")
    .in("artist_id", artistIds)
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
  }

  return {
    signals,
    observations,
    warnings:
      (data?.length ?? 0) >= MAX_TRADE_ROWS
        ? ["Trade-flow signal hit the row cap; add a SQL aggregate before scaling trading volume further."]
        : []
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
        traders: new Set<string>()
      };
    const orderValue = Math.abs(Number(trade.cash_delta));
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
  const activityScale = clamp(Math.log10(grossOrderValue + 1) / 4, 0.12, 1);
  const traderBreadth = clamp(uniqueTraderCount / 20, 0, 1);
  const traderDemand = clamp((valueImbalance * 30 + countImbalance * 10) * (0.62 + activityScale * 0.28 + traderBreadth * 0.1), -40, 40);
  const stats: Partial<HypeStats> = {
    traderDemand
  };
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
    sharesBought: round(bucket.sharesBought),
    sharesSold: round(bucket.sharesSold),
    valueImbalance,
    countImbalance,
    activityScale,
    traderBreadth,
    currentPrice: artist.currentPrice
  };

  return {
    signal: {
      stats,
      confidence: getConfidence({ tradeCount, grossOrderValue, uniqueTraderCount }),
      rawPayload
    },
    observations: [
      createObservation(artist.id, runDate, BUY_VALUE, bucket.buyValue, "cash", rawPayload),
      createObservation(artist.id, runDate, SELL_VALUE, bucket.sellValue, "cash", rawPayload),
      createObservation(artist.id, runDate, NET_ORDER_VALUE, netOrderValue, "cash", rawPayload),
      createObservation(artist.id, runDate, GROSS_ORDER_VALUE, grossOrderValue, "cash", rawPayload),
      createObservation(artist.id, runDate, TRADE_COUNT, tradeCount, "trades", rawPayload),
      createObservation(artist.id, runDate, UNIQUE_TRADER_COUNT, uniqueTraderCount, "traders", rawPayload)
    ]
  };
}

function getConfidence({
  tradeCount,
  grossOrderValue,
  uniqueTraderCount
}: {
  tradeCount: number;
  grossOrderValue: number;
  uniqueTraderCount: number;
}) {
  return clamp(
    0.28 + Math.log10(tradeCount + 1) * 0.14 + Math.log10(grossOrderValue + 1) * 0.035 + Math.min(0.16, uniqueTraderCount * 0.018),
    0.32,
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

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);

  return value.toISOString().slice(0, 10);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
