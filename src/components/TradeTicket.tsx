"use client";

import { useGame } from "@/components/GameProvider";
import { formatCurrency, formatShares } from "@/lib/formatters";
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
  const { buyShares, sellShares, getHolding, state } = useGame();
  const [side, setSide] = useState<"buy" | "sell">(defaultSide);
  const [shares, setShares] = useState("10");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const parsedShares = Number(shares);
  const holding = getHolding(artist.id);
  const estimatedValue = Number.isFinite(parsedShares) ? parsedShares * artist.currentPrice : 0;
  const maxBuy = Math.floor(state.cashBalance / artist.currentPrice);
  const maxSell = holding?.shares ?? 0;
  const disabled =
    !Number.isFinite(parsedShares) ||
    parsedShares <= 0 ||
    submitting ||
    (side === "buy" ? estimatedValue > state.cashBalance : parsedShares > maxSell);

  const helper = useMemo(() => {
    if (side === "buy") {
      return `Cash ${formatCurrency(state.cashBalance)} · Max ${formatShares(maxBuy)}`;
    }

    return `Your shares ${formatShares(maxSell)} · Value ${formatCurrency(maxSell * artist.currentPrice)}`;
  }, [artist.currentPrice, maxBuy, maxSell, side, state.cashBalance]);

  async function submitTrade() {
    setSubmitting(true);
    const result = side === "buy" ? buyShares(artist.id, parsedShares) : sellShares(artist.id, parsedShares);
    setMessage((await result).message);
    setSubmitting(false);
  }

  return (
    <section className="rounded-md border border-line bg-panel/90 p-4 shadow-market">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-paper/50">Order ticket</p>
          <h2 className="mt-1 text-xl font-black">{artist.ticker}</h2>
        </div>
        <p className="rounded-md bg-black/30 px-3 py-1 text-sm font-bold number-tabular text-paper/80">
          {formatCurrency(artist.currentPrice)}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 rounded-md bg-black/25 p-1">
        <button
          type="button"
          className={`rounded px-3 py-2 text-sm font-black transition ${
            side === "buy" ? "bg-mint/90 text-ink" : "text-paper/55 hover:text-paper"
          }`}
          onClick={() => setSide("buy")}
        >
          Buy
        </button>
        <button
          type="button"
          className={`rounded px-3 py-2 text-sm font-black transition ${
            side === "sell" ? "bg-ember/90 text-white" : "text-paper/55 hover:text-paper"
          }`}
          onClick={() => setSide("sell")}
        >
          Sell
        </button>
      </div>

      <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-paper/50" htmlFor="shares">
        Shares
      </label>
      <div className="mt-2 flex min-h-12 items-center overflow-hidden rounded-md border border-line bg-black/25">
        <button
          type="button"
          className="grid h-12 w-12 place-items-center border-r border-line text-paper/60 hover:text-paper"
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
          className="grid h-12 w-12 place-items-center border-l border-line text-paper/60 hover:text-paper"
          onClick={() => setShares(String(Math.floor((Number(shares) || 0) + 1)))}
          aria-label="Increase shares"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
        <span className="text-paper/55">{helper}</span>
        <span className="font-black number-tabular">{formatCurrency(estimatedValue || 0)}</span>
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={submitTrade}
        className={`mt-4 flex min-h-11 w-full items-center justify-center rounded-md px-4 text-sm font-black transition ${
          side === "buy"
            ? "bg-mint/90 text-ink hover:bg-mint"
            : "bg-ember/90 text-white hover:bg-ember"
        } disabled:cursor-not-allowed disabled:bg-paper/12 disabled:text-paper/35`}
      >
        {submitting ? "Sending order" : side === "buy" ? "Submit buy order" : "Submit sell order"}
      </button>

      {message ? <p className="mt-3 min-h-5 text-sm text-paper/60">{message}</p> : <p className="mt-3 min-h-5" />}
    </section>
  );
}
