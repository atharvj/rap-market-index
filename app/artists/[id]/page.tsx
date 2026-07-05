"use client";

import { ArtistAvatar } from "@/components/ArtistAvatar";
import { ChangePill } from "@/components/ChangePill";
import { ArtistPriceHistoryPanel } from "@/components/ArtistPriceHistoryPanel";
import { useGame } from "@/components/GameProvider";
import { HypeBars } from "@/components/HypeBars";
import { MetricCard } from "@/components/MetricCard";
import { TradeTicket } from "@/components/TradeTicket";
import { WatchlistButton } from "@/components/WatchlistButton";
import { formatCurrency } from "@/lib/formatters";
import { Activity, ArrowLeft, BarChart3, Flame, Radio, Zap } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function ArtistDetailPage() {
  const params = useParams<{ id: string }>();
  const { getArtist, getHolding } = useGame();
  const artist = getArtist(params.id);

  if (!artist) {
    return (
      <section className="rounded-md border border-line bg-panel/88 p-6 shadow-market">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-paper/55 hover:text-paper">
          <ArrowLeft className="h-4 w-4" />
          Market
        </Link>
        <h1 className="mt-6 text-3xl font-black">Artist not found</h1>
      </section>
    );
  }

  const holding = getHolding(artist.id);

  return (
    <div className="space-y-6">
      <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-paper/55 hover:text-paper">
        <ArrowLeft className="h-4 w-4" />
        Market
      </Link>

      <section className="rounded-md border border-line bg-panel/86 p-5 shadow-market sm:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="flex items-center gap-4">
            <ArtistAvatar artist={artist} size="lg" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-4xl font-black">{artist.name}</h1>
                <span className="rounded-md bg-brass px-2.5 py-1 text-xs font-black text-ink">{artist.ticker}</span>
                <WatchlistButton artistId={artist.id} label />
              </div>
              <p className="mt-2 text-sm font-bold text-paper/50">Market listing</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 md:justify-end">
            <div className="rounded-md border border-line bg-black/20 px-4 py-3 text-right">
              <p className="text-xs font-bold uppercase tracking-wide text-paper/45">Current price</p>
              <p className="text-3xl font-black number-tabular">{formatCurrency(artist.currentPrice)}</p>
            </div>
            <ChangePill value={artist.dailyChangePercent} />
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <ArtistPriceHistoryPanel artistId={artist.id} fallbackData={artist.priceHistory} />

          <section className="rounded-md border border-line bg-panel/86 p-5 shadow-market">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-md bg-brass text-ink">
                <Activity className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-paper/45">Market summary</p>
                <h2 className="mt-1 text-xl font-black">{artist.lastMoveExplanation}</h2>
                <p className="mt-3 text-sm leading-6 text-paper/58">
                  Prices reflect audience momentum, media activity, and order flow, so faster-growing artists can
                  move more sharply than stable large-cap listings.
                </p>
              </div>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            <MetricCard
              label="RMI score"
              value={`${artist.hypeScore}/100`}
              detail="Composite market rating"
              icon={<Flame className="h-4 w-4" />}
              tone="warm"
            />
            <MetricCard
              label="Volatility"
              value={`${artist.volatility.toFixed(2)}x`}
              detail="Daily move sensitivity"
              icon={<Zap className="h-4 w-4" />}
              tone="cool"
            />
            <MetricCard
              label="Your shares"
              value={holding ? holding.shares.toFixed(2) : "0"}
              detail={holding ? `${formatCurrency(holding.currentValue)} value` : "No position"}
              icon={<BarChart3 className="h-4 w-4" />}
              tone={holding ? "good" : "neutral"}
            />
          </section>

          <section className="rounded-md border border-line bg-panel/86 p-5 shadow-market">
            <div className="mb-5 flex items-center gap-2">
              <Radio className="h-4 w-4 text-cyan" aria-hidden="true" />
              <h2 className="text-xl font-black">Price drivers</h2>
            </div>
            <HypeBars stats={artist.stats} />
          </section>
        </div>

        <div className="lg:sticky lg:top-36 lg:self-start">
          <TradeTicket artist={artist} />
        </div>
      </div>
    </div>
  );
}
