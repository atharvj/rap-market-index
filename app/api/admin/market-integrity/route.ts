import { NextResponse } from "next/server";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { requireAdminRequest } from "@/server/admin-auth";
import { loadActiveArtists } from "@/server/market/supabase-repository";

export const dynamic = "force-dynamic";

type TransactionRow = Pick<
  Database["public"]["Views"]["market_trade_events"]["Row"],
  | "id"
  | "user_id"
  | "artist_id"
  | "type"
  | "shares"
  | "price"
  | "cash_delta"
  | "gross_value"
  | "commission"
  | "market_eligible"
  | "created_at"
>;

type ProfileRow = Pick<Database["public"]["Tables"]["profiles"]["Row"], "id" | "username">;

type ArtistLookup = {
  id: string;
  ticker: string;
  name: string;
};

type TraderAggregate = {
  userId: string;
  username: string | null;
  tradeCount: number;
  grossOrderValue: number;
  firstTradeAt: string;
  lastTradeAt: string;
};

type ArtistAggregate = {
  artistId: string;
  ticker: string;
  name: string;
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  coverCount: number;
  shortCount: number;
  grossOrderValue: number;
  netOrderValue: number;
  uniqueTraderCount: number;
  traders: Map<string, TraderAggregate>;
  firstTradeAt: string;
  lastTradeAt: string;
};

const DEFAULT_LOOKBACK_HOURS = 24;
const MAX_LOOKBACK_HOURS = 168;
const MAX_TRANSACTION_ROWS = 5000;
const CONCENTRATION_MIN_GROSS = 1000;
const LOW_BREADTH_MIN_GROSS = 2000;
const RAPID_WINDOW_MINUTES = 60;
const RAPID_TRADE_COUNT = 4;
const RAPID_GROSS_VALUE = 10000;

export async function GET(request: Request) {
  const auth = await requireAdminRequest(request, { allowMarketSecret: false });

  if (!auth.ok) {
    return auth.response;
  }

  const config = getSupabaseConfigStatus();

  if (!config.readyForAdminWrites) {
    return NextResponse.json(
      {
        ok: false,
        error: "Supabase admin credentials are not fully configured.",
        config
      },
      { status: 400 }
    );
  }

  try {
    const url = new URL(request.url);
    const lookbackHours = getInteger(url.searchParams.get("lookbackHours"), DEFAULT_LOOKBACK_HOURS, 1, MAX_LOOKBACK_HOURS);
    const generatedAt = new Date();
    const since = new Date(generatedAt.getTime() - lookbackHours * 60 * 60 * 1000).toISOString();
    const supabase = createServiceRoleClient();
    const artists = await loadActiveArtists(supabase);
    const artistLookup = new Map<string, ArtistLookup>(
      artists.map((artist) => [artist.id, { id: artist.id, ticker: artist.ticker, name: artist.name }])
    );
    const transactions = await loadRecentTransactions(supabase, since);
    const profiles = await loadProfiles(
      supabase,
      Array.from(new Set(transactions.map((transaction) => transaction.user_id)))
    );
    const profileLookup = new Map(profiles.map((profile) => [profile.id, profile]));
    const summary = buildSummary(transactions);
    const concentrationFlags = buildConcentrationFlags({
      transactions: transactions.filter((transaction) => transaction.market_eligible),
      artistLookup,
      profileLookup
    });
    const rapidTradeFlags = buildRapidTradeFlags({
      transactions: transactions.filter((transaction) => transaction.market_eligible),
      artistLookup,
      profileLookup,
      generatedAt
    });
    const excludedTradeSummary = buildExcludedTradeSummary(transactions.filter((transaction) => !transaction.market_eligible));
    const warnings = buildWarnings({
      transactionCount: transactions.length,
      summary,
      concentrationFlags,
      rapidTradeFlags
    });

    return NextResponse.json({
      ok: true,
      generatedAt: generatedAt.toISOString(),
      since,
      lookbackHours,
      summary,
      excludedTradeSummary,
      concentrationFlags,
      rapidTradeFlags,
      warnings
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Market integrity check failed.",
        config
      },
      { status: 500 }
    );
  }
}

async function loadRecentTransactions(supabase: ReturnType<typeof createServiceRoleClient>, since: string) {
  const { data, error } = await supabase
    .from("market_trade_events")
    .select("id,user_id,artist_id,type,shares,price,cash_delta,gross_value,commission,market_eligible,created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(MAX_TRANSACTION_ROWS);

  if (error) {
    if (error.message.includes("market_trade_events")) {
      throw new Error("Market integrity needs migration 018. Run supabase/migrations/018_short_selling_foundation.sql.");
    }

    if (error.message.includes("gross_value") || error.message.includes("market_eligible")) {
      throw new Error("Market integrity needs migration 014. Run supabase/migrations/014_market_economy_guardrails.sql.");
    }

    throw new Error(`Could not load recent trades: ${error.message}`);
  }

  return (data ?? []) as TransactionRow[];
}

async function loadProfiles(supabase: ReturnType<typeof createServiceRoleClient>, userIds: string[]) {
  if (!userIds.length) {
    return [];
  }

  const { data, error } = await supabase.from("profiles").select("id,username").in("id", userIds);

  if (error) {
    throw new Error(`Could not load trader profiles: ${error.message}`);
  }

  return (data ?? []) as ProfileRow[];
}

function buildSummary(transactions: TransactionRow[]) {
  const marketEligibleTrades = transactions.filter((transaction) => transaction.market_eligible);
  const excludedTrades = transactions.filter((transaction) => !transaction.market_eligible);
  const buyTrades = marketEligibleTrades.filter((transaction) => transaction.type === "buy");
  const sellTrades = marketEligibleTrades.filter((transaction) => transaction.type === "sell");
  const coverTrades = marketEligibleTrades.filter((transaction) => transaction.type === "cover");
  const shortTrades = marketEligibleTrades.filter((transaction) => transaction.type === "short");
  const bullishTrades = marketEligibleTrades.filter((transaction) => isBullishTrade(transaction.type));
  const bearishTrades = marketEligibleTrades.filter((transaction) => !isBullishTrade(transaction.type));

  return {
    tradeCount: transactions.length,
    marketEligibleTradeCount: marketEligibleTrades.length,
    excludedTradeCount: excludedTrades.length,
    uniqueTraderCount: new Set(transactions.map((transaction) => transaction.user_id)).size,
    marketEligibleUniqueTraderCount: new Set(marketEligibleTrades.map((transaction) => transaction.user_id)).size,
    grossOrderValue: roundMoney(sum(transactions, getGrossOrderValue)),
    marketEligibleGrossOrderValue: roundMoney(sum(marketEligibleTrades, getGrossOrderValue)),
    excludedGrossOrderValue: roundMoney(sum(excludedTrades, getGrossOrderValue)),
    buyGrossOrderValue: roundMoney(sum(buyTrades, getGrossOrderValue)),
    sellGrossOrderValue: roundMoney(sum(sellTrades, getGrossOrderValue)),
    coverGrossOrderValue: roundMoney(sum(coverTrades, getGrossOrderValue)),
    shortGrossOrderValue: roundMoney(sum(shortTrades, getGrossOrderValue)),
    bullishGrossOrderValue: roundMoney(sum(bullishTrades, getGrossOrderValue)),
    bearishGrossOrderValue: roundMoney(sum(bearishTrades, getGrossOrderValue)),
    commissionTotal: roundMoney(sum(transactions, (transaction) => Number(transaction.commission) || 0))
  };
}

function buildConcentrationFlags({
  transactions,
  artistLookup,
  profileLookup
}: {
  transactions: TransactionRow[];
  artistLookup: Map<string, ArtistLookup>;
  profileLookup: Map<string, ProfileRow>;
}) {
  const byArtist = new Map<string, ArtistAggregate>();

  for (const transaction of transactions) {
    const artist = artistLookup.get(transaction.artist_id) ?? {
      id: transaction.artist_id,
      ticker: transaction.artist_id,
      name: transaction.artist_id
    };
    const grossOrderValue = getGrossOrderValue(transaction);
    const signedOrderValue = isBullishTrade(transaction.type) ? grossOrderValue : -grossOrderValue;
    const aggregate =
      byArtist.get(transaction.artist_id) ??
      ({
        artistId: transaction.artist_id,
        ticker: artist.ticker,
        name: artist.name,
        tradeCount: 0,
        buyCount: 0,
        sellCount: 0,
        coverCount: 0,
        shortCount: 0,
        grossOrderValue: 0,
        netOrderValue: 0,
        uniqueTraderCount: 0,
        traders: new Map<string, TraderAggregate>(),
        firstTradeAt: transaction.created_at,
        lastTradeAt: transaction.created_at
      } satisfies ArtistAggregate);
    const profile = profileLookup.get(transaction.user_id) ?? null;
    const trader =
      aggregate.traders.get(transaction.user_id) ??
      ({
        userId: transaction.user_id,
        username: profile?.username ?? null,
        tradeCount: 0,
        grossOrderValue: 0,
        firstTradeAt: transaction.created_at,
        lastTradeAt: transaction.created_at
      } satisfies TraderAggregate);

    aggregate.tradeCount += 1;
    aggregate.buyCount += transaction.type === "buy" ? 1 : 0;
    aggregate.sellCount += transaction.type === "sell" ? 1 : 0;
    aggregate.coverCount += transaction.type === "cover" ? 1 : 0;
    aggregate.shortCount += transaction.type === "short" ? 1 : 0;
    aggregate.grossOrderValue += grossOrderValue;
    aggregate.netOrderValue += signedOrderValue;
    aggregate.firstTradeAt = minIsoDate(aggregate.firstTradeAt, transaction.created_at);
    aggregate.lastTradeAt = maxIsoDate(aggregate.lastTradeAt, transaction.created_at);
    trader.tradeCount += 1;
    trader.grossOrderValue += grossOrderValue;
    trader.firstTradeAt = minIsoDate(trader.firstTradeAt, transaction.created_at);
    trader.lastTradeAt = maxIsoDate(trader.lastTradeAt, transaction.created_at);
    aggregate.traders.set(transaction.user_id, trader);
    aggregate.uniqueTraderCount = aggregate.traders.size;
    byArtist.set(transaction.artist_id, aggregate);
  }

  return Array.from(byArtist.values())
    .map((aggregate) => {
      const largestTrader = Array.from(aggregate.traders.values()).sort(
        (left, right) => right.grossOrderValue - left.grossOrderValue
      )[0];
      const largestTraderShare = aggregate.grossOrderValue > 0 ? largestTrader.grossOrderValue / aggregate.grossOrderValue : 0;
      const severity = getConcentrationSeverity(aggregate, largestTraderShare);

      return {
        artistId: aggregate.artistId,
        ticker: aggregate.ticker,
        name: aggregate.name,
        severity,
        reason: getConcentrationReason(aggregate, largestTraderShare),
        tradeCount: aggregate.tradeCount,
        buyCount: aggregate.buyCount,
        sellCount: aggregate.sellCount,
        coverCount: aggregate.coverCount,
        shortCount: aggregate.shortCount,
        uniqueTraderCount: aggregate.uniqueTraderCount,
        grossOrderValue: roundMoney(aggregate.grossOrderValue),
        netOrderValue: roundMoney(aggregate.netOrderValue),
        largestTrader: {
          userId: largestTrader.userId,
          username: largestTrader.username,
          tradeCount: largestTrader.tradeCount,
          grossOrderValue: roundMoney(largestTrader.grossOrderValue),
          sharePercent: roundPercent(largestTraderShare * 100)
        },
        firstTradeAt: aggregate.firstTradeAt,
        lastTradeAt: aggregate.lastTradeAt
      };
    })
    .filter((flag) => flag.severity !== "normal")
    .sort((left, right) => severityRank(right.severity) - severityRank(left.severity) || right.grossOrderValue - left.grossOrderValue)
    .slice(0, 8);
}

function buildRapidTradeFlags({
  transactions,
  artistLookup,
  profileLookup,
  generatedAt
}: {
  transactions: TransactionRow[];
  artistLookup: Map<string, ArtistLookup>;
  profileLookup: Map<string, ProfileRow>;
  generatedAt: Date;
}) {
  const windowStart = new Date(generatedAt.getTime() - RAPID_WINDOW_MINUTES * 60 * 1000).toISOString();
  const groups = new Map<string, TraderAggregate & { artistId: string; ticker: string; name: string }>();

  for (const transaction of transactions) {
    if (transaction.created_at < windowStart) {
      continue;
    }

    const artist = artistLookup.get(transaction.artist_id) ?? {
      id: transaction.artist_id,
      ticker: transaction.artist_id,
      name: transaction.artist_id
    };
    const profile = profileLookup.get(transaction.user_id) ?? null;
    const key = `${transaction.user_id}:${transaction.artist_id}`;
    const current =
      groups.get(key) ??
      ({
        userId: transaction.user_id,
        username: profile?.username ?? null,
        artistId: transaction.artist_id,
        ticker: artist.ticker,
        name: artist.name,
        tradeCount: 0,
        grossOrderValue: 0,
        firstTradeAt: transaction.created_at,
        lastTradeAt: transaction.created_at
      } satisfies TraderAggregate & { artistId: string; ticker: string; name: string });

    current.tradeCount += 1;
    current.grossOrderValue += getGrossOrderValue(transaction);
    current.firstTradeAt = minIsoDate(current.firstTradeAt, transaction.created_at);
    current.lastTradeAt = maxIsoDate(current.lastTradeAt, transaction.created_at);
    groups.set(key, current);
  }

  return Array.from(groups.values())
    .filter((group) => group.tradeCount >= RAPID_TRADE_COUNT || group.grossOrderValue >= RAPID_GROSS_VALUE)
    .map((group) => ({
      userId: group.userId,
      username: group.username,
      artistId: group.artistId,
      ticker: group.ticker,
      name: group.name,
      tradeCount: group.tradeCount,
      grossOrderValue: roundMoney(group.grossOrderValue),
      windowMinutes: RAPID_WINDOW_MINUTES,
      severity: group.tradeCount >= RAPID_TRADE_COUNT * 2 || group.grossOrderValue >= RAPID_GROSS_VALUE * 2 ? "high" : "watch",
      firstTradeAt: group.firstTradeAt,
      lastTradeAt: group.lastTradeAt
    }))
    .sort((left, right) => right.grossOrderValue - left.grossOrderValue)
    .slice(0, 8);
}

function buildExcludedTradeSummary(transactions: TransactionRow[]) {
  return {
    tradeCount: transactions.length,
    grossOrderValue: roundMoney(sum(transactions, getGrossOrderValue)),
    uniqueTraderCount: new Set(transactions.map((transaction) => transaction.user_id)).size,
    artistCount: new Set(transactions.map((transaction) => transaction.artist_id)).size,
    latestTradeAt: transactions
      .map((transaction) => transaction.created_at)
      .sort((left, right) => right.localeCompare(left))[0] ?? null
  };
}

function buildWarnings({
  transactionCount,
  summary,
  concentrationFlags,
  rapidTradeFlags
}: {
  transactionCount: number;
  summary: ReturnType<typeof buildSummary>;
  concentrationFlags: ReturnType<typeof buildConcentrationFlags>;
  rapidTradeFlags: ReturnType<typeof buildRapidTradeFlags>;
}) {
  const warnings: string[] = [];

  if (transactionCount >= MAX_TRANSACTION_ROWS) {
    warnings.push(`Recent trade sample hit the ${MAX_TRANSACTION_ROWS} row limit; shorten lookback or paginate before launch.`);
  }

  if (summary.marketEligibleTradeCount > 0 && summary.marketEligibleUniqueTraderCount <= 2) {
    warnings.push("Market-eligible trade demand has very low trader breadth.");
  }

  if (concentrationFlags.some((flag) => flag.severity === "critical" || flag.severity === "high")) {
    warnings.push("Concentrated order flow is present; review before trusting trade-flow price signals.");
  }

  if (rapidTradeFlags.length > 0) {
    warnings.push("Rapid repeated trading is present in the latest window.");
  }

  return warnings;
}

function getConcentrationSeverity(aggregate: ArtistAggregate, largestTraderShare: number) {
  if (aggregate.grossOrderValue < CONCENTRATION_MIN_GROSS || aggregate.tradeCount < 2) {
    return "normal";
  }

  if (largestTraderShare >= 0.85 || (aggregate.uniqueTraderCount === 1 && aggregate.grossOrderValue >= LOW_BREADTH_MIN_GROSS)) {
    return "critical";
  }

  if (
    largestTraderShare >= 0.7 ||
    (aggregate.uniqueTraderCount <= 2 && aggregate.grossOrderValue >= LOW_BREADTH_MIN_GROSS)
  ) {
    return "high";
  }

  if (aggregate.uniqueTraderCount <= 3 && aggregate.grossOrderValue >= LOW_BREADTH_MIN_GROSS) {
    return "watch";
  }

  return "normal";
}

function getConcentrationReason(aggregate: ArtistAggregate, largestTraderShare: number) {
  if (largestTraderShare >= 0.85) {
    return "One trader controls most recent eligible order value.";
  }

  if (largestTraderShare >= 0.7) {
    return "One trader controls a large share of recent eligible order value.";
  }

  if (aggregate.uniqueTraderCount <= 2) {
    return "Recent eligible demand has low trader breadth.";
  }

  return "Recent eligible demand should be reviewed.";
}

function getGrossOrderValue(transaction: TransactionRow) {
  return Number(transaction.gross_value) || Math.abs(Number(transaction.cash_delta) || Number(transaction.price) * Number(transaction.shares));
}

function isBullishTrade(type: TransactionRow["type"]) {
  return type === "buy" || type === "cover";
}

function getInteger(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function minIsoDate(left: string, right: string) {
  return left <= right ? left : right;
}

function maxIsoDate(left: string, right: string) {
  return left >= right ? left : right;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundPercent(value: number) {
  return Math.round(value * 100) / 100;
}

function severityRank(severity: string) {
  if (severity === "critical") {
    return 3;
  }

  if (severity === "high") {
    return 2;
  }

  if (severity === "watch") {
    return 1;
  }

  return 0;
}

function sum<T>(items: T[], getValue: (item: T) => number) {
  return items.reduce((total, item) => total + getValue(item), 0);
}
