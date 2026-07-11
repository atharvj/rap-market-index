"use client";

import { ArtistAvatar } from "@/components/ArtistAvatar";
import { useAuth } from "@/components/AuthProvider";
import { useGame } from "@/components/GameProvider";
import { SignedInGate } from "@/components/SignedInGate";
import { ChangeText, RmiButton, RmiLineChart, RmiSection } from "@/components/RmiPrimitives";
import { formatCurrency, formatDate, formatPercent, formatShares } from "@/lib/formatters";
import { buildPortfolioQuoteSeries, getSeriesChangePercent } from "@/lib/market-analytics";
import { STARTING_CASH } from "@/lib/market";
import Link from "next/link";
import { useMemo } from "react";

export default function PortfolioPage() {
  const { session } = useAuth();
  const { holdings, shortPositions, portfolioValue, portfolioDayChange, state, gainPercent } = useGame();
  const invested = holdings.reduce((total, holding) => total + holding.currentValue, 0);
  const unrealizedProfitLoss = holdings.reduce((total, holding) => total + holding.profitLoss, 0) +
    shortPositions.reduce((total, position) => total + position.unrealizedProfitLoss, 0);
  const dayChangePercent = portfolioValue - portfolioDayChange > 0
    ? (portfolioDayChange / (portfolioValue - portfolioDayChange)) * 100
    : 0;
  const cashWeight = portfolioValue > 0 ? (state.cashBalance / portfolioValue) * 100 : 0;
  const largestHolding = [...holdings].sort((first, second) => second.currentValue - first.currentValue)[0];
  const concentration = largestHolding && invested > 0 ? (largestHolding.currentValue / invested) * 100 : 0;
  const chartData = useMemo(
    () => buildPortfolioQuoteSeries({ holdings, shortPositions, cashBalance: state.cashBalance }),
    [holdings, shortPositions, state.cashBalance]
  );
  const quoteHistoryChange = getSeriesChangePercent(chartData);
  const recentTransactions = state.transactions.slice(0, 6);

  if (!session) {
    return (
      <SignedInGate
        title="Your portfolio is private"
        description="Log in to see cash, holdings, returns, and account activity. Signed-out visitors cannot access portfolio data."
      />
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">Your Portfolio</h1>
          <p className="mt-1 text-sm text-paper/65">Positions, performance, allocation, and recent trading activity.</p>
        </div>
        <RmiButton href="/markets" variant="secondary">Find an Artist</RmiButton>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <PortfolioStat
          label="Total Value"
          value={formatCurrency(portfolioValue)}
          detail={`${formatCurrency(portfolioDayChange)} today`}
          good={portfolioDayChange >= 0}
        />
        <PortfolioStat label="Cash Available" value={formatCurrency(state.cashBalance)} detail={`${cashWeight.toFixed(1)}% of portfolio`} />
        <PortfolioStat label="Today's Return" value={formatPercent(dayChangePercent)} good={dayChangePercent >= 0} />
        <PortfolioStat label="All-Time Return" value={formatPercent(gainPercent)} detail={`${formatCurrency(portfolioValue - STARTING_CASH)} total`} good={gainPercent >= 0} />
      </section>

      <RmiSection
        title="Current Positions at Historical Quotes"
        subtitle="Values today's positions and cash against each recorded market close."
        action={chartData.length ? (
          <span className={quoteHistoryChange >= 0 ? "text-sm font-black text-mint number-tabular" : "text-sm font-black text-ember number-tabular"}>
            {formatPercent(quoteHistoryChange)}
          </span>
        ) : null}
      >
        {chartData.length ? (
          <div className="h-44 p-4">
            <RmiLineChart data={chartData} positive={quoteHistoryChange >= 0} height={165} />
          </div>
        ) : (
          <div className="grid min-h-40 place-items-center p-6 text-center">
            <div>
              <p className="text-sm font-black">Your portfolio is entirely cash</p>
              <p className="mt-1 text-sm text-paper/50">A quote-history chart appears after you open a position.</p>
            </div>
          </div>
        )}
      </RmiSection>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px]">
        <RmiSection title="Holdings" subtitle={`${holdings.length} long position${holdings.length === 1 ? "" : "s"}`}>
          <div className="overflow-x-auto">
            <div className="min-w-[610px]">
              <div className="grid grid-cols-[minmax(180px,1fr)_76px_100px_112px_96px] border-b border-line px-4 py-3 text-xs font-bold text-paper/45">
                <span>Artist</span>
                <span>Shares</span>
                <span>Average Cost</span>
                <span className="text-right">Market Value</span>
                <span className="text-right">Return</span>
              </div>
              {holdings.length ? (
                holdings.map((holding) => (
                  <Link
                    key={holding.artistId}
                    href={`/artists/${holding.artistId}`}
                    className="grid grid-cols-[minmax(180px,1fr)_76px_100px_112px_96px] items-center border-b border-line px-4 py-3 last:border-b-0 hover:bg-panelSoft"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <ArtistAvatar artist={holding.artist} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-black">{holding.artist.name}</span>
                        <span className="block text-xs text-paper/40">${holding.artist.ticker}</span>
                      </span>
                    </span>
                    <span className="text-sm font-black number-tabular">{formatShares(holding.shares)}</span>
                    <span className="text-sm font-black number-tabular">{formatCurrency(holding.averageBuyPrice)}</span>
                    <span className="text-right text-sm font-black number-tabular">{formatCurrency(holding.currentValue)}</span>
                    <span className="text-right text-xs"><ChangeText value={holding.profitLossPercent} /></span>
                  </Link>
                ))
              ) : (
                <div className="p-6 text-sm text-paper/55">
                  No holdings yet. Open Markets to compare quotes and start a fantasy position.
                </div>
              )}
            </div>
          </div>
        </RmiSection>

        <div className="space-y-4">
          <RmiSection title="Portfolio Analytics">
            <div className="divide-y divide-line text-sm">
              <AnalyticsRow label="Invested Value" value={formatCurrency(invested)} />
              <AnalyticsRow label="Unrealized P/L" value={formatCurrency(unrealizedProfitLoss)} tone={unrealizedProfitLoss >= 0 ? "good" : "bad"} />
              <AnalyticsRow label="Cash Reserve" value={`${cashWeight.toFixed(1)}%`} />
              <AnalyticsRow label="Largest Position" value={largestHolding?.artist.ticker ?? "None"} />
              <AnalyticsRow label="Top Weight" value={`${concentration.toFixed(1)}%`} />
            </div>
          </RmiSection>

          <RmiSection title="Allocation">
            <div className="space-y-3 p-4">
              {holdings.length ? (
                holdings.slice(0, 6).map((holding, index) => (
                  <div key={holding.artistId}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: allocationColor(index) }} />
                        <span className="truncate font-bold">{holding.artist.name}</span>
                      </span>
                      <span className="font-black number-tabular">{Math.round((holding.currentValue / Math.max(1, invested)) * 100)}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-panelSoft">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, (holding.currentValue / Math.max(1, invested)) * 100)}%`,
                          background: allocationColor(index)
                        }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-paper/55">No allocation yet.</p>
              )}
            </div>
          </RmiSection>
        </div>
      </div>

      <RmiSection title="Recent Activity" subtitle="Latest executed fantasy trades in this account.">
        {recentTransactions.length ? (
          <div className="divide-y divide-line">
            {recentTransactions.map((transaction) => {
              const artist = state.artists.find((candidate) => candidate.id === transaction.artistId);

              return (
                <div key={transaction.id} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_90px_100px_80px] sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate font-black">{artist?.name ?? transaction.artistId}</p>
                    <p className="text-xs text-paper/45">{formatDate(transaction.createdAt)}</p>
                  </div>
                  <span className="font-black capitalize">{transaction.type}</span>
                  <span className="font-black number-tabular">{formatShares(transaction.shares)} shares</span>
                  <span className="text-right font-black number-tabular">{formatCurrency(transaction.price)}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-5 text-sm text-paper/55">No executed trades yet.</div>
        )}
      </RmiSection>
    </div>
  );
}

function PortfolioStat({ label, value, detail, good = true }: { label: string; value: string; detail?: string; good?: boolean }) {
  return (
    <div className="rounded-xl bg-panelSoft p-4">
      <p className="text-xs font-bold text-paper/55">{label}</p>
      <p className="mt-1 text-2xl font-black number-tabular">{value}</p>
      {detail ? <p className={good ? "mt-1 text-xs font-black text-mint" : "mt-1 text-xs font-black text-ember"}>{detail}</p> : null}
    </div>
  );
}

function AnalyticsRow({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "bad" }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="font-bold text-paper/55">{label}</span>
      <span className={tone === "good" ? "font-black text-mint number-tabular" : tone === "bad" ? "font-black text-ember number-tabular" : "font-black number-tabular"}>
        {value}
      </span>
    </div>
  );
}

function allocationColor(index: number) {
  return ["#58a6ff", "#00c805", "#ffb01c", "#ff6570", "#9b7cff", "#29b6a8"][index % 6];
}
