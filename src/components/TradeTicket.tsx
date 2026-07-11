"use client";

import { useAuth } from "@/components/AuthProvider";
import { useGame } from "@/components/GameProvider";
import { formatCurrency, formatShares } from "@/lib/formatters";
import { estimateMarketMakerQuote } from "@/lib/trading";
import type { Artist } from "@/lib/types";
import { Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";

export function TradeTicket({
  artist,
  defaultSide = "buy"
}: {
  artist: Artist;
  defaultSide?: "buy" | "sell";
}) {
  const { buyShares, sellShares, getHolding, portfolioValue, state, syncMode, serverRefreshing } = useGame();
  const { loading: authLoading, session } = useAuth();
  const [side, setSide] = useState<"buy" | "sell">(defaultSide);
  const [shares, setShares] = useState("10");
  const [message, setMessage] = useState("");
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
  const maxSell = holding?.shares ?? 0;
  const maxPositionValue = portfolioValue * 0.25;
  const remainingPositionValue = Math.max(0, maxPositionValue - (holding?.currentValue ?? 0));
  const effectiveCostPerShare =
    quoteEstimate.buyExecutionPrice +
    Math.max(quoteEstimate.buyExecutionPrice * 0.01, 0.02);
  const maxBuy = Math.max(
    0,
    Math.min(state.cashBalance / effectiveCostPerShare, remainingPositionValue / quoteEstimate.buyExecutionPrice)
  );
  const tradeUnavailableReason = getTradeUnavailableReason({
    authLoading,
    hasSession: Boolean(session),
    serverRefreshing,
    syncMode
  });
  const disabled =
    Boolean(tradeUnavailableReason) ||
    !Number.isFinite(parsedShares) ||
    parsedShares <= 0 ||
    submitting ||
    (side === "buy" ? estimatedCashImpact > state.cashBalance || parsedShares > maxBuy : parsedShares > maxSell);

  const helper = useMemo(() => {
    if (tradeUnavailableReason) {
      return tradeUnavailableReason;
    }

    if (side === "buy") {
      return `Cash ${formatCurrency(state.cashBalance)} · Max ${formatShares(maxBuy)}`;
    }

    return `Your shares ${formatShares(maxSell)} · Value ${formatCurrency(maxSell * artist.currentPrice)}`;
  }, [artist.currentPrice, maxBuy, maxSell, side, state.cashBalance, tradeUnavailableReason]);

  async function submitTrade() {
    setSubmitting(true);
    const result = side === "buy" ? buyShares(artist.id, parsedShares) : sellShares(artist.id, parsedShares);
    setMessage((await result).message);
    setSubmitting(false);
  }

  return (
    <section className="rmi-card overflow-hidden shadow-market">
      <div className="border-b border-line bg-panelSoft px-4 py-3">
        <p className="text-sm font-black">Trade {artist.ticker}</p>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-paper/50">Last Price</p>
            <h2 className="mt-1 text-2xl font-black number-tabular">{formatCurrency(artist.currentPrice)}</h2>
          </div>
          <p className="rounded-lg border border-line bg-panel px-3 py-1 text-sm font-bold number-tabular text-paper/70">
            {artist.name}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg border border-line bg-panelSoft p-1">
          <button
            type="button"
            className={`rounded-md px-3 py-2 text-sm font-black transition ${
              side === "buy" ? "bg-mint text-white" : "text-paper/60 hover:bg-panel hover:text-paper"
            }`}
            onClick={() => setSide("buy")}
          >
            Buy
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-2 text-sm font-black transition ${
              side === "sell" ? "bg-ember text-white" : "text-paper/60 hover:bg-panel hover:text-paper"
            }`}
            onClick={() => setSide("sell")}
          >
            Sell
          </button>
        </div>

        <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-paper/50" htmlFor="shares">
          Shares
        </label>
        <div className="mt-2 flex min-h-12 items-center overflow-hidden rounded-lg border border-line bg-panel">
          <button
            type="button"
            className="grid h-12 w-12 place-items-center border-r border-line text-paper/50 hover:bg-panelSoft hover:text-paper"
            onClick={() => setShares(String(Math.max(1, Math.floor((Number(shares) || 1) - 1))))}
            aria-label="Decrease shares"
          >
            <Minus className="h-4 w-4" />
          </button>
          <input
            id="shares"
            className="h-12 min-w-0 flex-1 bg-transparent px-3 text-center text-lg font-black outline-none number-tabular"
            inputMode="decimal"
            value={shares}
            onChange={(event) => setShares(event.target.value)}
          />
          <button
            type="button"
            className="grid h-12 w-12 place-items-center border-l border-line text-paper/50 hover:bg-panelSoft hover:text-paper"
            onClick={() => setShares(String(Math.floor((Number(shares) || 0) + 1)))}
            aria-label="Increase shares"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
          <span className="text-paper/60">{helper}</span>
          <span className="font-black number-tabular">{formatCurrency(estimatedValue || 0)}</span>
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

        <button
          type="button"
          disabled={disabled}
          onClick={submitTrade}
          className={`mt-4 flex min-h-11 w-full items-center justify-center rounded-lg px-4 text-sm font-black transition ${
            side === "buy"
              ? "bg-mint text-white hover:bg-mint/90"
              : "bg-ember text-white hover:bg-ember/90"
          } disabled:cursor-not-allowed disabled:bg-paper/10 disabled:text-paper/40`}
        >
          {submitting
            ? "Sending order"
            : tradeUnavailableReason
              ? tradeUnavailableReason
              : side === "buy"
                ? "Submit buy order"
                : "Submit sell order"}
        </button>

        {message ? <p className="mt-3 min-h-5 text-sm text-paper/60">{message}</p> : <p className="mt-3 min-h-5" />}
      </div>
    </section>
  );
}

function getTradeUnavailableReason({
  authLoading,
  hasSession,
  serverRefreshing,
  syncMode
}: {
  authLoading: boolean;
  hasSession: boolean;
  serverRefreshing: boolean;
  syncMode: "demo" | "supabase";
}) {
  if (authLoading) {
    return "Checking session";
  }

  if (!hasSession) {
    return "Sign in to trade";
  }

  if (serverRefreshing || syncMode !== "supabase") {
    return "Syncing profile";
  }

  return "";
}
