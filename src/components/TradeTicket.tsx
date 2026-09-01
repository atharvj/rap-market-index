"use client";

import { useAuth } from "@/components/AuthProvider";
import { useGame } from "@/components/GameProvider";
import { RmiNotice } from "@/components/RmiPrimitives";
import { formatCurrency } from "@/lib/formatters";
import { getShortingReadiness } from "@/lib/shorting-readiness";
import {
  clampTradeShareInput,
  estimateMarketMakerQuote,
  formatTradeShareInput,
  getRemainingDailyArtistBuyValue,
  getRemainingDailyArtistShortValue,
  getMaximumBuyShares,
  getMaximumShortShares,
  MIN_TRADE_VALUE,
  SHORT_INITIAL_MARGIN_RATE,
  roundShareQuantityDown
} from "@/lib/trading";
import type { Artist } from "@/lib/types";
import { ArrowDownRight, ArrowUpRight, LoaderCircle, LockKeyhole, Minus, Plus, Radio } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type TradeSide = "buy" | "sell" | "short" | "cover";

export function TradeTicket({
  artist,
  defaultSide = "buy"
}: {
  artist: Artist;
  defaultSide?: TradeSide;
}) {
  const {
    buyShares,
    coverShares,
    sellShares,
    shortShares,
    getHolding,
    getShortPosition,
    marketError,
    marketReady,
    portfolioValue,
    state,
    syncMode,
    serverRefreshing
  } = useGame();
  const { loading: authLoading, session } = useAuth();
  const [side, setSide] = useState<TradeSide>(defaultSide);
  const [shares, setShares] = useState("10");
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const parsedShares = Number(shares);
  const holding = getHolding(artist.id);
  const shortPosition = getShortPosition(artist.id);
  const quoteSide = side === "buy" || side === "cover" ? "buy" : "sell";
  const quoteEstimate = estimateMarketMakerQuote({
    side: quoteSide,
    midPrice: artist.currentPrice,
    shares: parsedShares,
    volatility: artist.volatility
  });
  const estimatedValue = quoteEstimate.orderValue;
  const estimatedCommission = quoteEstimate.commission;
  const estimatedCashImpact = quoteEstimate.totalCost;
  const estimatedCoverCashChange = shortPosition && shortPosition.shares > 0
    ? (shortPosition.collateral * (parsedShares / shortPosition.shares))
      + (shortPosition.averageShortPrice - quoteEstimate.executionPrice) * parsedShares
      - estimatedCommission
    : 0;
  const maxSell = roundShareQuantityDown(holding?.shares ?? 0);
  const maxCover = roundShareQuantityDown(shortPosition?.shares ?? 0);
  const maxPositionValue = Math.max(100, portfolioValue * 0.25);
  const remainingLongPositionValue = Math.max(0, maxPositionValue - (holding?.currentValue ?? 0));
  const remainingShortPositionValue = Math.max(0, maxPositionValue - (shortPosition?.currentLiability ?? 0));
  const remainingDailyBuyValue = getRemainingDailyArtistBuyValue({
    artistId: artist.id,
    portfolioValue,
    transactions: state.transactions
  });
  const calculatedMaxBuy = getMaximumBuyShares({
    cashBalance: state.cashBalance,
    remainingPositionValue: remainingLongPositionValue,
    remainingDailyBuyValue,
    midPrice: artist.currentPrice,
    volatility: artist.volatility
  });
  const maxBuy = shortPosition ? 0 : calculatedMaxBuy;
  const remainingDailyShortValue = getRemainingDailyArtistShortValue({
    artistId: artist.id,
    portfolioValue,
    transactions: state.transactions
  });
  const calculatedMaxShort = getMaximumShortShares({
    cashBalance: state.cashBalance,
    remainingPositionValue: remainingShortPositionValue,
    remainingDailyShortValue,
    midPrice: artist.currentPrice,
    volatility: artist.volatility
  });
  const maxShort = holding ? 0 : calculatedMaxShort;
  const shortingReadiness = getShortingReadiness(artist.priceHistory);
  const maxShares = side === "buy" ? maxBuy : side === "sell" ? maxSell : side === "short" ? maxShort : maxCover;
  const tradeUnavailableReason = getTradeUnavailableReason({
    authLoading,
    hasSession: Boolean(session),
    marketError,
    marketReady,
    serverRefreshing,
    syncMode
  });
  const limitReason = getLimitReason({
    artist,
    cashBalance: state.cashBalance,
    hasLongPosition: Boolean(holding),
    hasShortPosition: Boolean(shortPosition),
    maxBuy,
    maxCover,
    maxSell,
    maxShort,
    remainingDailyBuyValue,
    remainingDailyShortValue,
    remainingLongPositionValue,
    remainingShortPositionValue,
    shortingReadiness,
    side
  });
  const blockedReason = tradeUnavailableReason || limitReason;
  const orderBlocked = isOrderBlocked({
    estimatedOrderValue: estimatedValue,
    maxShares,
    parsedShares,
    blockedReason
  });
  const disabled = orderBlocked || submitting;

  useEffect(() => {
    setSide(defaultSide);
  }, [artist.id, defaultSide]);

  useEffect(() => {
    if (blockedReason) {
      return;
    }

    setShares((current) => clampTradeShareInput(current, maxShares));
  }, [artist.id, blockedReason, maxShares, side]);

  const helper = useMemo(() => {
    if (tradeUnavailableReason) {
      return tradeUnavailableReason;
    }

    if (side === "buy") {
      if (limitReason) {
        return limitReason;
      }

      return `Max ${formatTradeLimit(maxBuy)} shares · ${getBuyLimitLabel({
        cashBalance: state.cashBalance,
        remainingDailyBuyValue,
        remainingPositionValue: remainingLongPositionValue
      })}`;
    }

    if (side === "short") {
      return limitReason || `Max ${formatTradeLimit(maxShort)} shares · 50% collateral`;
    }

    if (side === "cover") {
      return limitReason || `Short ${formatTradeLimit(maxCover)} · Max ${formatTradeLimit(maxCover)}`;
    }

    return limitReason || `Owned ${formatTradeLimit(maxSell)} · Max ${formatTradeLimit(maxSell)}`;
  }, [limitReason, maxBuy, maxCover, maxSell, maxShort, remainingDailyBuyValue, remainingLongPositionValue, side, state.cashBalance, tradeUnavailableReason]);

  function changeShares(nextValue: string) {
    if (nextValue && !/^\d*$/.test(nextValue)) {
      return;
    }

    setMessage("");
    setShares(clampTradeShareInput(nextValue, maxShares));
  }

  function incrementShares() {
    if (maxShares <= 0) {
      return;
    }

    const current = Number.isFinite(parsedShares) ? Math.max(0, parsedShares) : 0;
    const next = Math.min(maxShares, Math.floor(current) + 1 || Math.min(1, maxShares));
    setMessage("");
    setShares(formatTradeShareInput(next));
  }

  function decrementShares() {
    if (maxShares <= 0) {
      return;
    }

    const minimum = Math.min(1, maxShares);
    const current = Number.isFinite(parsedShares) ? parsedShares : minimum;
    const next = Math.max(minimum, Math.ceil(current) - 1);
    setMessage("");
    setShares(formatTradeShareInput(next));
  }

  async function submitTrade() {
    setSubmitting(true);
    setMessage("");

    try {
      const result = side === "buy"
        ? buyShares(artist.id, parsedShares)
        : side === "sell"
          ? sellShares(artist.id, parsedShares)
          : side === "short"
            ? shortShares(artist.id, parsedShares)
            : coverShares(artist.id, parsedShares);
      const completed = await result;
      setMessage(completed.message);
      setMessageIsError(!completed.ok);
    } catch {
      setMessage("The order could not be submitted. Please try again.");
      setMessageIsError(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="trade" className="rmi-card scroll-mt-24 overflow-hidden">
      <div className="rmi-section-header flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <span className="flex min-w-0 items-center gap-2">
          <Radio className="h-3.5 w-3.5 text-cyan" aria-hidden="true" />
          <span className="text-xs font-semibold">Trade</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs font-semibold text-mint">
          <span className="rmi-live-dot" aria-hidden="true" />
          Live Quote
        </span>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="rmi-data-label">Last Price</p>
            <h2 className="mt-1 text-3xl font-bold number-tabular">{formatCurrency(artist.currentPrice)}</h2>
          </div>
          <span className="border border-cyan/25 bg-cyan/8 px-2.5 py-1 text-xs font-semibold text-cyan">
            ${artist.ticker}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-1 rounded-[var(--radius-control)] border border-line bg-ink/45 p-1 sm:grid-cols-4">
          {(["buy", "sell", "short", "cover"] as TradeSide[]).map((tradeSide) => {
            const active = side === tradeSide;
            const bullish = tradeSide === "buy" || tradeSide === "cover";

            return (
              <button
                key={tradeSide}
                type="button"
                className={`flex items-center justify-center gap-1.5 rounded-[calc(var(--radius-control)-2px)] px-2 py-2 text-xs font-semibold transition ${
                  active
                    ? bullish ? "bg-mint text-ink" : "bg-ember text-white"
                    : "text-paper/60 hover:bg-panel hover:text-paper"
                }`}
                onClick={() => {
                  setSide(tradeSide);
                  setMessage("");
                }}
                aria-pressed={active}
              >
                {bullish
                  ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />}
                {tradeSide.charAt(0).toUpperCase() + tradeSide.slice(1)}
              </button>
            );
          })}
        </div>

        {!shortingReadiness.enabled && side === "short" ? (
          <div className="mt-3 flex items-start gap-2 border border-line bg-panelSoft px-3 py-2 text-xs font-medium leading-5 text-paper/50">
            <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brass" aria-hidden="true" />
            <span>{shortingReadiness.reason}</span>
          </div>
        ) : null}

        <label className="mt-4 block text-xs font-semibold text-paper/50" htmlFor="shares">
          Shares
        </label>
        <div className="mt-2 flex min-h-12 items-center overflow-hidden rounded-[var(--radius-control)] border border-line bg-ink/35 focus-within:border-cyan/65 focus-within:ring-2 focus-within:ring-cyan/10">
          <button
            type="button"
            className="grid h-12 w-12 place-items-center border-r border-line text-paper/50 hover:bg-panelSoft hover:text-paper disabled:cursor-not-allowed disabled:text-paper/20"
            onClick={decrementShares}
            disabled={maxShares <= 0 || (Number.isFinite(parsedShares) && parsedShares <= Math.min(1, maxShares))}
            aria-label="Decrease shares"
          >
            <Minus className="h-4 w-4" />
          </button>
          <input
            id="shares"
            className="h-12 min-w-0 flex-1 bg-transparent px-3 text-center text-lg font-semibold outline-none number-tabular"
            inputMode="numeric"
            pattern="[0-9]*"
            value={shares}
            onChange={(event) => changeShares(event.target.value)}
            aria-describedby="trade-share-limit"
          />
          <button
            type="button"
            className="grid h-12 w-12 place-items-center border-l border-line text-paper/50 hover:bg-panelSoft hover:text-paper disabled:cursor-not-allowed disabled:text-paper/20"
            onClick={incrementShares}
            disabled={maxShares <= 0 || (Number.isFinite(parsedShares) && parsedShares >= maxShares)}
            aria-label="Increase shares"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
          <span id="trade-share-limit" className="text-paper/60" aria-live="polite">{helper}</span>
          <span className="font-semibold number-tabular">{formatCurrency(estimatedValue || 0)}</span>
        </div>
        <div className="mt-3 border-t border-line pt-3">
          <div className="flex items-center justify-between gap-3 text-xs font-bold text-paper/50">
            <span>Estimated execution</span>
            <span className="number-tabular">{formatCurrency(quoteEstimate.executionPrice)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3 text-xs font-bold text-paper/50">
            <span>Spread / slippage</span>
            <span className="number-tabular">
              {quoteEstimate.spreadPercent.toFixed(2)}% / {quoteEstimate.slippagePercent.toFixed(2)}%
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-xs font-bold text-paper/50">
            <span>Fantasy commission</span>
            <span className="number-tabular">{formatCurrency(estimatedCommission || 0)}</span>
          </div>
          {side === "short" ? (
            <div className="mt-1 flex items-center justify-between gap-3 text-xs font-bold text-paper/50">
              <span>Collateral held</span>
              <span className="number-tabular">{formatCurrency(estimatedValue * SHORT_INITIAL_MARGIN_RATE)}</span>
            </div>
          ) : null}
          <div className="mt-1 flex items-center justify-between gap-3 text-xs font-bold text-paper/50">
            <span>{getCashImpactLabel(side)}</span>
            <span className="number-tabular">
              {side === "buy"
                ? formatCurrency(estimatedCashImpact || 0)
                : side === "sell"
                  ? formatCurrency(quoteEstimate.netProceeds)
                  : side === "short"
                    ? formatCurrency(estimatedValue * SHORT_INITIAL_MARGIN_RATE + estimatedCommission)
                    : formatSignedCash(estimatedCoverCashChange)}
            </span>
          </div>
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={submitTrade}
          className={`mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] px-4 text-sm font-semibold transition ${
            side === "buy" || side === "cover"
              ? "bg-mint text-ink hover:bg-mint/90"
              : "bg-ember text-white hover:bg-ember/90"
          } disabled:cursor-not-allowed disabled:bg-paper/10 disabled:text-paper/40`}
        >
          {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {submitting
            ? "Submitting order"
            : orderBlocked
              ? blockedReason || `${formatTradeSide(side)} unavailable`
              : `Submit ${side} order`}
        </button>

        {message ? (
          <RmiNotice tone={messageIsError ? "error" : "success"} className="mt-3">
            {message}
          </RmiNotice>
        ) : null}
        <p className="mt-3 border-t border-line pt-3 text-xs font-medium text-paper/35">
          Fantasy market only · no real money or cash-out
        </p>
      </div>
    </section>
  );
}

function formatTradeLimit(value: number) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 0
  });
}

function getTradeUnavailableReason({
  authLoading,
  hasSession,
  marketError,
  marketReady,
  serverRefreshing,
  syncMode
}: {
  authLoading: boolean;
  hasSession: boolean;
  marketError: string;
  marketReady: boolean;
  serverRefreshing: boolean;
  syncMode: "demo" | "supabase";
}) {
  if (authLoading) {
    return "Checking session";
  }

  if (!hasSession) {
    return "Sign in to trade";
  }

  if (!marketReady) {
    return marketError || "Loading live market data";
  }

  if (serverRefreshing || syncMode !== "supabase") {
    return "Syncing profile";
  }

  return "";
}

function isOrderBlocked({
  estimatedOrderValue,
  maxShares,
  parsedShares,
  blockedReason
}: {
  estimatedOrderValue: number;
  maxShares: number;
  parsedShares: number;
  blockedReason: string;
}) {
  if (blockedReason) {
    return true;
  }

  if (maxShares <= 0) {
    return true;
  }

  if (!Number.isFinite(parsedShares) || parsedShares <= 0 || !Number.isInteger(parsedShares)) {
    return true;
  }

  if (parsedShares > maxShares) {
    return true;
  }

  if (estimatedOrderValue < MIN_TRADE_VALUE) {
    return true;
  }

  return false;
}

function getLimitReason({
  artist,
  cashBalance,
  hasLongPosition,
  hasShortPosition,
  maxBuy,
  maxCover,
  maxSell,
  maxShort,
  remainingDailyBuyValue,
  remainingDailyShortValue,
  remainingLongPositionValue,
  remainingShortPositionValue,
  shortingReadiness,
  side
}: {
  artist: Artist;
  cashBalance: number;
  hasLongPosition: boolean;
  hasShortPosition: boolean;
  maxBuy: number;
  maxCover: number;
  maxSell: number;
  maxShort: number;
  remainingDailyBuyValue: number;
  remainingDailyShortValue: number;
  remainingLongPositionValue: number;
  remainingShortPositionValue: number;
  shortingReadiness: ReturnType<typeof getShortingReadiness>;
  side: TradeSide;
}) {
  if (side === "sell") {
    return maxSell <= 0 ? "No shares to sell" : "";
  }

  if (side === "cover") {
    return maxCover <= 0 ? "No short position to cover" : "";
  }

  if (side === "short") {
    if (hasLongPosition) {
      return "Sell your long position before opening a short";
    }

    if (!shortingReadiness.enabled) {
      return shortingReadiness.reason;
    }

    if (maxShort > 0) {
      return "";
    }

    const oneShareQuote = estimateMarketMakerQuote({
      side: "sell",
      midPrice: artist.currentPrice,
      shares: 1,
      volatility: artist.volatility
    });

    if (remainingDailyShortValue < oneShareQuote.orderValue) {
      return "24h short limit reached";
    }

    if (remainingShortPositionValue < oneShareQuote.orderValue) {
      return "25% artist limit reached";
    }

    if (cashBalance < oneShareQuote.orderValue * SHORT_INITIAL_MARGIN_RATE + oneShareQuote.commission) {
      return "Not enough fantasy cash for collateral";
    }

    return "Short unavailable";
  }

  if (side === "buy" && hasShortPosition) {
    return "Cover your short position before buying";
  }

  if (maxBuy > 0) {
    return "";
  }

  const oneShareQuote = estimateMarketMakerQuote({
    side: "buy",
    midPrice: artist.currentPrice,
    shares: 1,
    volatility: artist.volatility
  });

  if (remainingDailyBuyValue < oneShareQuote.orderValue) {
    return "24h artist limit reached";
  }

  if (remainingLongPositionValue < oneShareQuote.orderValue) {
    return "25% artist limit reached";
  }

  if (cashBalance < oneShareQuote.totalCost) {
    return "Not enough fantasy cash";
  }

  return "Buy unavailable";
}

function formatTradeSide(side: TradeSide) {
  return side.charAt(0).toUpperCase() + side.slice(1);
}

function getCashImpactLabel(side: TradeSide) {
  if (side === "buy") return "Total cost";
  if (side === "sell") return "Estimated proceeds";
  if (side === "short") return "Cash required";
  return "Estimated cash change";
}

function formatSignedCash(value: number) {
  if (!Number.isFinite(value)) return formatCurrency(0);
  return `${value > 0 ? "+" : value < 0 ? "-" : ""}${formatCurrency(Math.abs(value))}`;
}

function getBuyLimitLabel({
  cashBalance,
  remainingDailyBuyValue,
  remainingPositionValue
}: {
  cashBalance: number;
  remainingDailyBuyValue: number;
  remainingPositionValue: number;
}) {
  if (remainingDailyBuyValue <= Math.min(cashBalance, remainingPositionValue)) {
    return "limited by 24h cap";
  }

  if (remainingPositionValue <= cashBalance) {
    return "limited by 25% cap";
  }

  return "limited by fantasy cash";
}
