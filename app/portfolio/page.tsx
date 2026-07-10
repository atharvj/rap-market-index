"use client";

import { ArtistAvatar } from "@/components/ArtistAvatar";
import { useGame } from "@/components/GameProvider";
import { ChangeText, RmiLineChart, RmiSection } from "@/components/RmiPrimitives";
import { formatCurrency, formatShares } from "@/lib/formatters";
import { STARTING_CASH } from "@/lib/market";
import Link from "next/link";
import { useMemo } from "react";

export default function PortfolioPage() {
  const { holdings, portfolioValue, state, gainPercent } = useGame();
  const invested = holdings.reduce((total, holding) => total + holding.currentValue, 0);
  const chartData = useMemo(
    () =>
      Array.from({ length: 16 }, (_, index) => ({
        date: String(index),
        price: STARTING_CASH + (portfolioValue - STARTING_CASH) * (index / 15) + Math.sin(index) * 160
      })),
    [portfolioValue]
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-black">Your portfolio</h1>
        <p className="mt-1 text-sm font-bold text-paper/70">RMI global league</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <PortfolioStat label="total value" value={formatCurrency(portfolioValue)} detail={`${formatCurrency(portfolioValue - STARTING_CASH)} today`} good={portfolioValue >= STARTING_CASH} />
        <PortfolioStat label="cash available" value={formatCurrency(state.cashBalance)} />
        <PortfolioStat label="all-time return" value={`${gainPercent >= 0 ? "+" : ""}${gainPercent.toFixed(1)}%`} good={gainPercent >= 0} />
      </section>

      <div className="h-32">
        <RmiLineChart data={chartData} positive={portfolioValue >= STARTING_CASH} height={132} />
      </div>

      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_220px]">
        <RmiSection title="Holdings">
          <div className="overflow-hidden">
            <div className="grid grid-cols-[minmax(0,1fr)_70px_92px_96px] border-b border-line px-4 py-3 text-xs font-bold text-paper/45">
              <span>artist</span>
              <span>shares</span>
              <span>avg cost</span>
              <span className="text-right">value</span>
            </div>
            {holdings.length ? (
              holdings.map((holding) => (
                <Link
                  key={holding.artistId}
                  href={`/artists/${holding.artistId}`}
                  className="grid grid-cols-[minmax(0,1fr)_70px_92px_96px] items-center border-b border-line px-4 py-3 last:border-b-0 hover:bg-panelSoft"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <ArtistAvatar artist={holding.artist} size="sm" />
                    <span className="truncate text-sm font-black">{holding.artist.name}</span>
                  </span>
                  <span className="text-sm font-black number-tabular">{formatShares(holding.shares)}</span>
                  <span className="text-sm font-black number-tabular">{formatCurrency(holding.averageBuyPrice)}</span>
                  <span className="text-right text-sm font-black number-tabular">
                    {formatCurrency(holding.currentValue)}
                    <span className="block text-xs">
                      <ChangeText value={holding.profitLossPercent} />
                    </span>
                  </span>
                </Link>
              ))
            ) : (
              <p className="p-5 text-sm font-bold text-paper/60">No holdings yet. Buy an artist from Markets.</p>
            )}
          </div>
        </RmiSection>

        <RmiSection title="Allocation">
          <div className="space-y-3 p-4">
            {holdings.length ? (
              holdings.slice(0, 5).map((holding, index) => (
                <div key={holding.artistId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-3 w-3 rounded-sm" style={{ background: allocationColor(index) }} />
                    <span className="truncate font-bold">{holding.artist.name}</span>
                  </span>
                  <span className="font-black number-tabular">{Math.round((holding.currentValue / Math.max(1, invested)) * 100)}%</span>
                </div>
              ))
            ) : (
              <p className="text-sm font-bold text-paper/60">No allocation yet.</p>
            )}
          </div>
        </RmiSection>
      </div>
    </div>
  );
}

function PortfolioStat({ label, value, detail, good = true }: { label: string; value: string; detail?: string; good?: boolean }) {
  return (
    <div className="rounded-lg bg-panelSoft p-4">
      <p className="text-xs font-bold text-paper/65">{label}</p>
      <p className="mt-1 text-2xl font-black number-tabular">{value}</p>
      {detail ? <p className={good ? "text-xs font-black text-mint" : "text-xs font-black text-ember"}>{detail}</p> : null}
    </div>
  );
}

function allocationColor(index: number) {
  return ["#58a6ff", "#00c805", "#ffb01c", "#ff6570", "#9b7cff"][index % 5];
}
