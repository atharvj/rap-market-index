"use client";

import { useAuth } from "@/components/AuthProvider";
import { useGame } from "@/components/GameProvider";
import { RmiNotice } from "@/components/RmiPrimitives";
import { formatCurrency } from "@/lib/formatters";
import {
  clampTradeShareInput,
  estimateMarketMakerQuote,
  formatTradeShareInput,
  getMaximumBuyShares,
  MIN_TRADE_VALUE,
  roundShareQuantityDown
} from "@/lib/trading";
import type { Artist } from "@/lib/types";
import { ArrowDownRight, ArrowUpRight, LoaderCircle, Minus, Plus, Radio } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export function TradeTicket({
  artist,
  defaultSide = "buy"
}: {
  artist: Artist;
  defaultSide?: "buy" | "sell";
}) {
  const {
    buyShares,
    sellShares,
    getHolding,
    marketError,
    marketReady,
    portfolioValue,
    state,
    syncMode,
    serverRefreshing
  } = useGame();
  const { loading: authLoading, session } = useAuth();
  const [side, setSide] = useState<"buy" | "sell">(defaultSide);
  const [shares, setShares] = useState("10");
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const parsedShares = Number(shares);
  const holding = getHolding(artist.id);
  const quoteEstimate = estimateMarketMakerQuote({
    side,
    midPrice: artist.currentPrice,
    shares: parsedShares,
    volatility: artist.volatility
  });
  const estimatedValue = quoteEstimate.orderValue;
  const estimatedCommission = quoteEstimate.commission;
  const estimatedCashImpact = quoteEstimate.totalCost;
  const maxSell = roundShareQuantityDown(holding?.shares ?? 0);
  const maxPositionValue = portfolioValue * 0.25;
  const remainingPositionValue = Math.max(0, maxPositionValue - (holding?.currentValue ?? 0));
  const maxBuy = getMaximumBuyShares({
    cashBalance: state.cashBalance,
    remainingPositionValue,
    midPrice: artist.currentPrice,
    volatility: artist.volatility
  });
  const maxShares = side === "buy" ? maxBuy : maxSell;
  const tradeUnavailableReason = getTradeUnavailableReason({
    authLoading,
    hasSession: Boolean(session),
    marketError,
    marketReady,
    serverRefreshing,
    syncMode
  });
  const orderBlockReason = getOrderBlockReason({
    estimatedOrderValue: estimatedValue,
    maxShares,
    parsedShares,
    remainingPositionValue,
    side,
    tradeUnavailableReason
  });
  const disabled = Boolean(orderBlockReason) || submitting;

  useEffect(() => {
    setSide(defaultSide);
  }, [artist.id, defaultSide]);

  useEffect(() => {
    if (tradeUnavailableReason) {
      return;
    }

    setShares((current) => clampTradeShareInput(current, maxShares));
  }, [artist.id, maxShares, side, tradeUnavailableReason]);

  const helper = useMemo(() => {
    if (tradeUnavailableReason) {
      return tradeUnavailableReason;
    }

    if (side === "buy") {
      return `Fantasy cash ${formatCurrency(state.cashBalance)} · Max ${formatTradeShareInput(maxBuy)}`;
    }

    return `Your shares ${formatTradeShareInput(maxSell)} · Value ${formatCurrency(maxSell * artist.currentPrice)}`;
  }, [artist.currentPrice, maxBuy, maxSell, side, state.cashBalance, tradeUnavailableReason]);

  function changeShares(nextValue: string) {
    if (nextValue && !/^\d*\.?\d*$/.test(nextValue)) {
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
      const result = side === "buy" ? buyShares(artist.id, parsedShares) : sellShares(artist.id, parsedShares);
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

        <div className="mt-4 grid grid-cols-2 gap-1 rounded-[var(--radius-control)] border border-line bg-ink/45 p-1">
          <button
            type="button"
            className={`flex items-center justify-center gap-1.5 rounded-[calc(var(--radius-control)-2px)] px-3 py-2 text-sm font-semibold transition ${
              side === "buy" ? "bg-mint text-ink" : "text-paper/60 hover:bg-panel hover:text-paper"
            }`}
            onClick={() => {
              setSide("buy");
              setMessage("");
            }}
            aria-pressed={side === "buy"}
          >
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            Buy
          </button>
          <button
            type="button"
            className={`flex items-center justify-center gap-1.5 rounded-[calc(var(--radius-control)-2px)] px-3 py-2 text-sm font-semibold transition ${
              side === "sell" ? "bg-ember text-white" : "text-paper/60 hover:bg-panel hover:text-paper"
            }`}
            onClick={() => {
              setSide("sell");
              setMessage("");
            }}
            aria-pressed={side === "sell"}
          >
            <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
            Sell
          </button>
        </div>

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
            inputMode="decimal"
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
            <span>Commission</span>
            <span className="number-tabular">{formatCurrency(estimatedCommission || 0)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3 text-xs font-bold text-paper/50">
            <span>{side === "buy" ? "Total cost" : "Estimated proceeds"}</span>
            <span className="number-tabular">
              {side === "buy" ? formatCurrency(estimatedCashImpact || 0) : formatCurrency(quoteEstimate.netProceeds)}
            </span>
          </div>
        </div>

        {orderBlockReason && !submitting ? (
          <div className="mt-3 border border-brass/35 bg-brass/10 px-3 py-2 text-xs leading-5 text-paper/70" role="status">
            <p>{orderBlockReason}</p>
            <Link href="/help#trading" className="font-semibold text-cyan hover:text-cyan/75">
              See trading limits and pauses
            </Link>
          </div>
        ) : null}

        <button
          type="button"
          disabled={disabled}
          onClick={submitTrade}
          className={`mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] px-4 text-sm font-semibold transition ${
            side === "buy"
              ? "bg-mint text-ink hover:bg-mint/90"
              : "bg-ember text-white hover:bg-ember/90"
          } disabled:cursor-not-allowed disabled:bg-paper/10 disabled:text-paper/40`}
        >
          {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {submitting
            ? "Submitting order"
            : orderBlockReason
              ? tradeUnavailableReason || `${side === "buy" ? "Buy" : "Sell"} unavailable`
              : side === "buy"
                ? "Submit buy order"
                : "Submit sell order"}
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

function getOrderBlockReason({
  estimatedOrderValue,
  maxShares,
  parsedShares,
  remainingPositionValue,
  side,
  tradeUnavailableReason
}: {
  estimatedOrderValue: number;
  maxShares: number;
  parsedShares: number;
  remainingPositionValue: number;
  side: "buy" | "sell";
  tradeUnavailableReason: string;
}) {
  if (tradeUnavailableReason) {
    return tradeUnavailableReason;
  }

  if (side === "sell" && maxShares <= 0) {
    return "You do not own any shares of this artist to sell.";
  }

  if (side === "buy" && maxShares <= 0) {
    return remainingPositionValue <= 0
      ? "This artist is already at the 25% portfolio position limit."
      : "You do not have enough fantasy cash available for another share.";
  }

  if (!Number.isFinite(parsedShares) || parsedShares <= 0) {
    return "Enter a share amount greater than zero.";
  }

  if (parsedShares > maxShares) {
    return `The most you can ${side} right now is ${formatTradeShareInput(maxShares)} shares.`;
  }

  if (estimatedOrderValue < MIN_TRADE_VALUE) {
    return `The minimum order value is ${formatCurrency(MIN_TRADE_VALUE)}.`;
  }

  return "";
}
