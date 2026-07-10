"use client";

import { ArtistAvatar } from "@/components/ArtistAvatar";
import { useAuth } from "@/components/AuthProvider";
import { useGame } from "@/components/GameProvider";
import { MarketNewsFeed } from "@/components/MarketNewsFeed";
import { ChangeText, RmiButton, RmiLineChart, RmiSection } from "@/components/RmiPrimitives";
import { WatchlistButton } from "@/components/WatchlistButton";
import { sanitizeMoveExplanation } from "@/lib/artist-explanations";
import { formatCurrency, formatShares } from "@/lib/formatters";
import type { Artist } from "@/lib/types";
import clsx from "clsx";
import { BadgeCheck, CalendarDays, KeyRound, Trophy } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";

const ranges = ["1D", "1W", "1M", "1Y", "All"];

export default function ArtistDetailPage() {
  const params = useParams<{ id: string }>();
  const { session } = useAuth();
  const { getArtist, getHolding, buyShares, sellShares } = useGame();
  const artist = getArtist(params.id);
  const [range, setRange] = useState("1M");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [shares, setShares] = useState(10);
  const [message, setMessage] = useState("");

  const visibleHistory = useMemo(() => {
    if (!artist) {
      return [];
    }

    const count = range === "1D" ? 8 : range === "1W" ? 12 : range === "1M" ? 24 : range === "1Y" ? 60 : 120;
    return artist.priceHistory.slice(-count);
  }, [artist, range]);

  if (!artist) {
    return (
      <RmiSection>
        <div className="p-6">
          <h1 className="text-2xl font-black">Artist not found</h1>
          <RmiButton href="/markets" variant="secondary">Back to markets</RmiButton>
        </div>
      </RmiSection>
    );
  }

  const activeArtist = artist;
  const holding = getHolding(activeArtist.id);
  const cost = shares * activeArtist.currentPrice;
  const explanation = sanitizeMoveExplanation(activeArtist.ticker, activeArtist.lastMoveExplanation);

  async function submitOrder() {
    setMessage("");
    const result = side === "buy" ? await buyShares(activeArtist.id, shares) : await sellShares(activeArtist.id, shares);
    setMessage(result.message);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px]">
      <main className="min-w-0 space-y-5">
        <section className="space-y-5">
          <div className="flex items-start gap-4">
            <ArtistAvatar artist={artist} size="xl" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-black">{artist.name}</h1>
                <BadgeCheck className="h-4 w-4 text-cyan" aria-hidden="true" />
                <WatchlistButton artistId={artist.id} />
              </div>
              <p className="mt-1 text-sm font-bold text-paper/60">${artist.ticker} · rap market · {artist.hypeScore}/100 score</p>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-end gap-3">
              <p className="text-4xl font-black number-tabular">{formatCurrency(artist.currentPrice)}</p>
              <ChangeText value={artist.dailyChangePercent} suffix=" today" />
            </div>
            <div className="mt-3 flex gap-2">
              {ranges.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setRange(item)}
                  className={clsx(
                    "h-7 rounded-lg border px-3 text-xs font-black",
                    range === item ? "border-paper bg-paper text-ink" : "border-line text-paper/75 hover:border-cyan"
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="h-36">
            <RmiLineChart data={visibleHistory} positive={artist.dailyChangePercent >= 0} height={144} />
          </div>
        </section>

        <section className="grid grid-cols-4 gap-3">
          <QuoteStat label="market cap" value={`$${Math.max(1, artist.hypeScore * artist.currentPrice / 10).toFixed(1)}M`} />
          <QuoteStat label="volume 24h" value={`$${Math.max(18, Math.abs(artist.dailyChangePercent) * artist.currentPrice * 9).toFixed(0)}K`} />
          <QuoteStat label="holders" value={formatShares(Math.max(42, Math.round(artist.hypeScore * 94)))} />
          <QuoteStat label="all-time high" value={formatCurrency(Math.max(...artist.priceHistory.map((point) => point.price), artist.currentPrice))} />
        </section>

        <RmiSection title="Catalysts">
          <div className="divide-y divide-line px-4">
            <CatalystRow icon={<KeyRound className="h-4 w-4" />} text={explanation} />
            <CatalystRow icon={<CalendarDays className="h-4 w-4" />} text="Release, review, social, and audience signals are checked during market runs." />
            <CatalystRow icon={<Trophy className="h-4 w-4" />} text="Large moves require stronger source confidence than routine uploads." />
          </div>
        </RmiSection>

        <RmiSection title="Market news">
          <div className="px-4">
            <MarketNewsFeed artistId={artist.id} limit={6} compact />
          </div>
        </RmiSection>
      </main>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <section className="rmi-card p-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSide("buy")}
              className={clsx("h-9 rounded-lg text-sm font-black", side === "buy" ? "bg-mint text-black" : "border border-line")}
            >
              Buy
            </button>
            <button
              type="button"
              onClick={() => setSide("sell")}
              className={clsx("h-9 rounded-lg text-sm font-black", side === "sell" ? "bg-ember text-black" : "border border-line")}
            >
              Sell
            </button>
          </div>
          <label className="mt-4 block text-xs font-bold text-paper/55" htmlFor="shares">
            Shares
          </label>
          <input
            id="shares"
            type="number"
            min={1}
            value={shares}
            onChange={(event) => setShares(Math.max(1, Number(event.target.value)))}
            className="mt-1 h-10 w-full rounded-lg border border-line bg-panelSoft px-3 text-sm font-black outline-none focus:border-cyan"
          />
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="font-bold text-paper/55">Est. cost</span>
            <span className="font-black number-tabular">{formatCurrency(cost)}</span>
          </div>
          <button
            type="button"
            onClick={submitOrder}
            className="mt-3 h-10 w-full rounded-lg bg-paper text-sm font-black text-ink disabled:opacity-60"
            disabled={!session}
          >
            {session ? "Place order" : "Sign in to trade"}
          </button>
          {message ? <p className="mt-3 text-xs font-bold text-paper/60">{message}</p> : null}
        </section>

        <OrderBook artist={artist} />
        {holding ? (
          <RmiSection title="Your position">
            <div className="space-y-2 p-4 text-sm">
              <PositionRow label="shares" value={formatShares(holding.shares)} />
              <PositionRow label="value" value={formatCurrency(holding.currentValue)} />
              <PositionRow label="avg cost" value={formatCurrency(holding.averageBuyPrice)} />
            </div>
          </RmiSection>
        ) : null}
      </aside>
    </div>
  );
}

function QuoteStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold text-paper/55">{label}</p>
      <p className="mt-1 text-sm font-black number-tabular">{value}</p>
    </div>
  );
}

function CatalystRow({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex gap-3 py-3 text-sm">
      <span className="mt-0.5 text-paper/45">{icon}</span>
      <p className="font-bold leading-5 text-paper/85">{text}</p>
    </div>
  );
}

function PositionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="font-bold text-paper/55">{label}</span>
      <span className="font-black number-tabular">{value}</span>
    </div>
  );
}

function OrderBook({ artist }: { artist: Artist }) {
  const asks = [0.28, 0.19, 0.11].map((spread, index) => ({
    price: artist.currentPrice + spread,
    shares: [120, 165, 75][index]
  }));
  const bids = [0.30, 0.39, 0.48].map((spread, index) => ({
    price: artist.currentPrice - spread,
    shares: [180, 95, 60][index]
  }));

  return (
    <section className="rmi-card p-4">
      <h2 className="text-sm font-black">Order book</h2>
      <div className="mt-3 grid gap-1 text-xs">
        <div className="grid grid-cols-[1fr_1fr] text-paper/45">
          <span>price</span>
          <span className="text-right">shares</span>
        </div>
        {asks.map((row) => (
          <BookRow key={row.price} row={row} side="ask" />
        ))}
        <p className="py-2 text-center text-xs font-bold text-paper/40">spread $0.80</p>
        {bids.map((row) => (
          <BookRow key={row.price} row={row} side="bid" />
        ))}
      </div>
    </section>
  );
}

function BookRow({ row, side }: { row: { price: number; shares: number }; side: "ask" | "bid" }) {
  return (
    <div className="relative grid grid-cols-[1fr_1fr] overflow-hidden rounded px-1 py-0.5">
      <span className={side === "ask" ? "relative z-10 font-black text-ember" : "relative z-10 font-black text-mint"}>
        {formatCurrency(row.price)}
      </span>
      <span className="relative z-10 text-right font-black">{row.shares}</span>
      <span
        className={clsx("absolute bottom-0 right-0 top-0 opacity-20", side === "ask" ? "bg-ember" : "bg-mint")}
        style={{ width: `${Math.min(82, row.shares / 2)}%` }}
      />
    </div>
  );
}
