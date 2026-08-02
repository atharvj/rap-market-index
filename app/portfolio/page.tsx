"use client";

import { ArtistAvatar } from "@/components/ArtistAvatar";
import { useAuth } from "@/components/AuthProvider";
import { useGame } from "@/components/GameProvider";
import { PriceChart } from "@/components/PriceChart";
import { SignedInGate } from "@/components/SignedInGate";
import { RmiButton, RmiSection } from "@/components/RmiPrimitives";
import { formatCurrency, formatDate, formatPercent, formatShares } from "@/lib/formatters";
import { buildPortfolioQuoteSeries, getSeriesChangePercent } from "@/lib/market-analytics";
import { STARTING_CASH } from "@/lib/market";
import Link from "next/link";
import { Activity, BriefcaseBusiness, Radar, WalletCards } from "lucide-react";
import { useMemo } from "react";

export default function PortfolioPage() {
  const { session } = useAuth();
  const { holdings, shortPositions, portfolioValue, portfolioDayChange, state, gainPercent } = useGame();
  const invested = holdings.reduce((total, holding) => total + holding.currentValue, 0);
  const unrealizedProfitLoss = holdings.reduce((total, holding) => total + holding.profitLoss, 0) +
    shortPositions.reduce((total, position) => total + position.unrealizedProfitLoss, 0);
  const holdingsCost = holdings.reduce((total, holding) => total + holding.costBasis, 0);
  const totalReturn = portfolioValue - STARTING_CASH;
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
        title="Sign in to view your portfolio"
        description="Log in to see your cash, holdings, returns, and account activity."
      />
    );
  }

  return (
    <div className="space-y-5">
      <header className="rmi-page-head flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="rmi-kicker"><BriefcaseBusiness className="h-3.5 w-3.5" /> Portfolio</div>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Your Portfolio</h1>
          <p className="mt-1 text-sm text-paper/65">Positions, performance, allocation, and recent trading activity.</p>
        </div>
        <div className="flex items-center gap-2"><span className="rmi-status-chip"><span className="rmi-live-dot" /> Live valuation</span><RmiButton href="/markets" variant="secondary">Trade Markets</RmiButton></div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <PortfolioStat
          label="Portfolio Value"
          value={formatCurrency(portfolioValue)}
        />
        <PortfolioStat
          label="Today's P/L"
          value={formatSignedCurrency(portfolioDayChange)}
          detail={formatPercent(dayChangePercent)}
          tone={portfolioDayChange >= 0 ? "good" : "bad"}
        />
        <PortfolioStat
          label="Total Return"
          value={formatSignedCurrency(totalReturn)}
          detail={formatPercent(gainPercent)}
          tone={totalReturn >= 0 ? "good" : "bad"}
        />
        <PortfolioStat
          label="Buying Power"
          value={formatCurrency(state.cashBalance)}
          detail={`${cashWeight.toFixed(1)}% held in cash`}
        />
      </section>

      <RmiSection
        title="Current Holdings Trend"
        subtitle="Estimated value of your current holdings and cash at each recorded market close."
        action={chartData.length ? (
          <span className={quoteHistoryChange >= 0 ? "text-sm font-semibold text-mint number-tabular" : "text-sm font-semibold text-ember number-tabular"}>
            {formatPercent(quoteHistoryChange)}
          </span>
        ) : null}
      >
        {chartData.length ? (
          <div className="p-4">
            <div className="rmi-chart-shell p-3"><PriceChart data={chartData} height={220} /></div>
          </div>
        ) : (
          <div className="grid min-h-40 place-items-center p-6 text-center">
            <div>
              <p className="text-sm font-semibold">Your portfolio is entirely cash</p>
              <p className="mt-1 text-sm text-paper/50">A quote-history chart appears after you open a position.</p>
            </div>
          </div>
        )}
      </RmiSection>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px]">
        <RmiSection
          title="Holdings"
          subtitle={`${holdings.length} long position${holdings.length === 1 ? "" : "s"} · ${formatCurrency(invested)} market value`}
        >
          {holdings.length ? (
            <>
              <div className="divide-y divide-line xl:hidden">
                {holdings.map((holding) => (
                  <article key={holding.artistId} className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <Link href={`/artists/${holding.artistId}`} className="flex min-w-0 items-center gap-3 hover:text-cyan">
                        <ArtistAvatar artist={holding.artist} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{holding.artist.name}</span>
                          <span className="block text-xs text-paper/40">${holding.artist.ticker}</span>
                        </span>
                      </Link>
                      <span className="shrink-0 text-right">
                        <span className="block text-xs font-medium text-paper/45">Market value</span>
                        <span className="block text-sm font-semibold number-tabular">{formatCurrency(holding.currentValue)}</span>
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-line/70 py-3">
                      <HoldingDetail label="Shares" value={formatShares(holding.shares)} />
                      <HoldingDetail label="Current price" value={formatCurrency(holding.artist.currentPrice)} align="right" />
                      <HoldingDetail label="Avg. buy price" value={formatCurrency(holding.averageBuyPrice)} />
                      <HoldingDetail label="Position cost" value={formatCurrency(holding.costBasis)} align="right" />
                    </div>

                    <div className="flex items-center justify-between gap-4 border-b border-line/70 py-3">
                      <span className="text-xs font-medium text-paper/45">Unrealized P/L</span>
                      <PositionReturn amount={holding.profitLoss} percent={holding.profitLossPercent} />
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <HoldingTradeLink artistId={holding.artistId} artistName={holding.artist.name} side="buy" />
                      <HoldingTradeLink artistId={holding.artistId} artistName={holding.artist.name} side="sell" />
                    </div>
                  </article>
                ))}
              </div>

              <div className="hidden overflow-x-auto xl:block">
                <div className="min-w-[920px]">
                  <div className="rmi-table-head grid grid-cols-[minmax(170px,1fr)_64px_88px_92px_104px_108px_118px_104px] items-center gap-2 px-4 py-3 text-xs font-medium text-paper/45">
                    <span>Artist</span>
                    <span>Shares</span>
                    <span className="text-right">Price</span>
                    <span className="text-right">Avg. Buy</span>
                    <span className="text-right">Position Cost</span>
                    <span className="text-right">Market Value</span>
                    <span className="text-right">Unrealized P/L</span>
                    <span className="text-right">Trade</span>
                  </div>
                  {holdings.map((holding) => (
                    <div
                      key={holding.artistId}
                      className="rmi-table-row grid grid-cols-[minmax(170px,1fr)_64px_88px_92px_104px_108px_118px_104px] items-center gap-2 px-4 py-3"
                    >
                      <Link href={`/artists/${holding.artistId}`} className="flex min-w-0 items-center gap-3 pr-3 hover:text-cyan">
                        <ArtistAvatar artist={holding.artist} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{holding.artist.name}</span>
                          <span className="block text-xs text-paper/40">${holding.artist.ticker}</span>
                        </span>
                      </Link>
                      <span className="text-sm font-semibold number-tabular">{formatShares(holding.shares)}</span>
                      <span className="text-right text-sm font-semibold number-tabular">{formatCurrency(holding.artist.currentPrice)}</span>
                      <span className="text-right text-sm font-semibold number-tabular">{formatCurrency(holding.averageBuyPrice)}</span>
                      <span className="text-right text-sm font-semibold number-tabular">{formatCurrency(holding.costBasis)}</span>
                      <span className="text-right text-sm font-semibold number-tabular">{formatCurrency(holding.currentValue)}</span>
                      <PositionReturn amount={holding.profitLoss} percent={holding.profitLossPercent} />
                      <span className="ml-auto flex overflow-hidden rounded-md border border-line bg-ink/30 text-xs font-semibold">
                        <HoldingTradeLink artistId={holding.artistId} artistName={holding.artist.name} side="buy" compact />
                        <HoldingTradeLink artistId={holding.artistId} artistName={holding.artist.name} side="sell" compact />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4 p-6">
              <p className="text-sm text-paper/55">No holdings yet. Compare quotes and start a fantasy position.</p>
              <RmiButton href="/markets" className="shrink-0">Trade Markets</RmiButton>
            </div>
          )}
        </RmiSection>

        <div className="space-y-4">
          <RmiSection title="Portfolio Analytics">
            <div className="divide-y divide-line text-sm">
              <AnalyticsRow label="Holdings Value" value={formatCurrency(invested)} />
              <AnalyticsRow label="Holdings Cost" value={formatCurrency(holdingsCost)} />
              <AnalyticsRow label="Unrealized P/L" value={formatSignedCurrency(unrealizedProfitLoss)} tone={unrealizedProfitLoss >= 0 ? "good" : "bad"} />
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
                        <span className="truncate font-medium">{holding.artist.name}</span>
                      </span>
                      <span className="font-semibold number-tabular">{Math.round((holding.currentValue / Math.max(1, invested)) * 100)}%</span>
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
                    <p className="truncate font-semibold">{artist?.name ?? transaction.artistId}</p>
                    <p className="text-xs text-paper/45">{formatDate(transaction.createdAt)}</p>
                  </div>
                  <span className="font-medium capitalize">{transaction.type}</span>
                  <span className="font-semibold number-tabular">{formatShares(transaction.shares)} shares</span>
                  <span className="text-right font-semibold number-tabular">{formatCurrency(transaction.price)}</span>
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

type PerformanceTone = "neutral" | "good" | "bad";

function PortfolioStat({
  label,
  value,
  detail,
  tone = "neutral"
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: PerformanceTone;
}) {
  const valueTone = tone === "good" ? "text-mint" : tone === "bad" ? "text-ember" : "";
  const detailTone = tone === "good" ? "text-mint" : tone === "bad" ? "text-ember" : "text-paper/45";

  return (
    <div className="rmi-metric p-4">
      <p className="text-xs font-medium text-paper/55">{label}</p>
      <p className={`mt-1 text-2xl font-bold number-tabular ${valueTone}`}>{value}</p>
      {detail ? <p className={`mt-1 text-xs font-semibold ${detailTone}`}>{detail}</p> : null}
    </div>
  );
}

function AnalyticsRow({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "bad" }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="font-medium text-paper/55">{label}</span>
      <span className={tone === "good" ? "font-semibold text-mint number-tabular" : tone === "bad" ? "font-semibold text-ember number-tabular" : "font-semibold number-tabular"}>
        {value}
      </span>
    </div>
  );
}

function PositionReturn({ amount, percent }: { amount: number; percent: number }) {
  const tone = amount >= 0 ? "text-mint" : "text-ember";

  return (
    <span className={`text-right ${tone}`}>
      <span className="block text-sm font-semibold number-tabular">{formatSignedCurrency(amount)}</span>
      <span className="block text-xs font-semibold number-tabular">{formatPercent(percent)}</span>
    </span>
  );
}

function HoldingDetail({
  label,
  value,
  align = "left"
}: {
  label: string;
  value: string;
  align?: "left" | "right";
}) {
  return (
    <span className={align === "right" ? "text-right" : undefined}>
      <span className="block text-xs font-medium text-paper/45">{label}</span>
      <span className="mt-1 block text-sm font-semibold number-tabular">{value}</span>
    </span>
  );
}

function HoldingTradeLink({
  artistId,
  artistName,
  side,
  compact = false
}: {
  artistId: string;
  artistName: string;
  side: "buy" | "sell";
  compact?: boolean;
}) {
  const label = side === "buy" ? "Buy" : "Sell";
  const colorClass = side === "buy"
    ? "text-mint hover:bg-mint/10"
    : "text-ember hover:bg-ember/10";
  const layoutClass = compact
    ? `px-2 py-1.5 ${side === "sell" ? "border-l border-line" : ""}`
    : `inline-flex min-h-9 items-center justify-center rounded-md border font-semibold ${
        side === "buy" ? "border-mint/35" : "border-ember/35"
      }`;

  return (
    <Link
      href={`/artists/${artistId}?side=${side}#trade`}
      className={`text-xs transition-colors ${colorClass} ${layoutClass}`}
      aria-label={`${label} ${artistName}`}
    >
      {label}
    </Link>
  );
}

function allocationColor(index: number) {
  return ["#58a6ff", "#00c805", "#ffb01c", "#ff6570", "#9b7cff", "#29b6a8"][index % 6];
}

function formatSignedCurrency(value: number) {
  const formatted = formatCurrency(Math.abs(value));
  return value > 0 ? `+${formatted}` : value < 0 ? `-${formatted}` : formatted;
}
