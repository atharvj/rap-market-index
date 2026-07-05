"use client";

import { ArtistAvatar } from "@/components/ArtistAvatar";
import { ChangePill } from "@/components/ChangePill";
import { useGame } from "@/components/GameProvider";
import { MetricCard } from "@/components/MetricCard";
import { TradeTicket } from "@/components/TradeTicket";
import { formatCurrency, formatPercent, formatShares } from "@/lib/formatters";
import { BarChart3, Clock3, DollarSign, LineChart, WalletCards } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export default function PortfolioPage() {
  const { holdings, portfolioValue, portfolioDayChange, state, getArtist } = useGame();
  const [selectedArtistId, setSelectedArtistId] = useState(holdings[0]?.artistId ?? "");
  const selectedArtist = getArtist(selectedArtistId) ?? holdings[0]?.artist;
  const investedValue = holdings.reduce((total, holding) => total + holding.currentValue, 0);
  const totalCost = holdings.reduce((total, holding) => total + holding.costBasis, 0);
  const totalProfitLoss = investedValue - totalCost;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-brass">Portfolio</p>
        <h1 className="mt-2 text-4xl font-black">Account overview</h1>
      </div>

      <section className="grid gap-3 md:grid-cols-4">
        <MetricCard
          label="Total value"
          value={formatCurrency(portfolioValue)}
          detail={`${formatCurrency(portfolioDayChange)} today`}
          icon={<WalletCards className="h-4 w-4" />}
          tone={portfolioDayChange >= 0 ? "good" : "bad"}
        />
        <MetricCard
          label="Cash"
          value={formatCurrency(state.cashBalance)}
          detail="Available to trade"
          icon={<DollarSign className="h-4 w-4" />}
          tone="warm"
        />
        <MetricCard
          label="Holdings"
          value={formatCurrency(investedValue)}
          detail={`${holdings.length} positions`}
          icon={<BarChart3 className="h-4 w-4" />}
          tone="cool"
        />
        <MetricCard
          label="Open P/L"
          value={formatCurrency(totalProfitLoss)}
          detail={totalCost ? formatPercent((totalProfitLoss / totalCost) * 100) : "0.00%"}
          icon={<LineChart className="h-4 w-4" />}
          tone={totalProfitLoss >= 0 ? "good" : "bad"}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-md border border-line bg-panel/86 shadow-market">
          <div className="border-b border-line p-4">
            <h2 className="text-xl font-black">Holdings</h2>
          </div>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[820px] border-collapse">
              <thead>
                <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-paper/42">
                  <th className="px-4 py-3">Artist</th>
                  <th className="px-4 py-3 text-right">Shares</th>
                  <th className="px-4 py-3 text-right">Avg buy</th>
                  <th className="px-4 py-3 text-right">Value</th>
                  <th className="px-4 py-3 text-right">P/L</th>
                  <th className="px-4 py-3 text-right">Daily</th>
                </tr>
              </thead>
              <tbody>
                {holdings.length ? (
                  holdings.map((holding) => (
                    <tr
                      key={holding.artistId}
                      className="cursor-pointer border-b border-line/70 last:border-0 hover:bg-white/[0.035]"
                      onClick={() => setSelectedArtistId(holding.artistId)}
                    >
                      <td className="px-4 py-3">
                        <Link href={`/artists/${holding.artistId}`} className="flex items-center gap-3">
                          <ArtistAvatar artist={holding.artist} />
                          <span>
                            <span className="block font-black">{holding.artist.name}</span>
                            <span className="text-sm font-bold text-paper/45">{holding.artist.ticker}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right font-black number-tabular">
                        {formatShares(holding.shares)}
                      </td>
                      <td className="px-4 py-3 text-right number-tabular">
                        {formatCurrency(holding.averageBuyPrice)}
                      </td>
                      <td className="px-4 py-3 text-right font-black number-tabular">
                        {formatCurrency(holding.currentValue)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-black number-tabular ${
                          holding.profitLoss >= 0 ? "text-mint" : "text-ember"
                        }`}
                      >
                        {formatCurrency(holding.profitLoss)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ChangePill value={holding.artist.dailyChangePercent} />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-10 text-center text-paper/45" colSpan={6}>
                      No artist shares held yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-4 lg:sticky lg:top-36 lg:self-start">
          {selectedArtist ? <TradeTicket artist={selectedArtist} defaultSide="sell" /> : null}

          <section className="rounded-md border border-line bg-panel/86 p-4 shadow-market">
            <div className="mb-4 flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-brass" aria-hidden="true" />
              <h2 className="text-lg font-black">Recent trades</h2>
            </div>
            <div className="max-h-80 space-y-3 overflow-auto pr-1 scrollbar-thin">
              {state.transactions.length ? (
                state.transactions.slice(0, 8).map((transaction) => {
                  const artist = getArtist(transaction.artistId);

                  return (
                    <div key={transaction.id} className="rounded-md border border-line bg-black/20 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-black uppercase">{transaction.type}</span>
                        <span className="text-sm font-bold text-paper/45">{artist?.ticker ?? "N/A"}</span>
                      </div>
                      <p className="mt-2 text-sm text-paper/58">
                        {formatShares(transaction.shares)} shares at {formatCurrency(transaction.price)}
                      </p>
                      {typeof transaction.commission === "number" && transaction.commission > 0 ? (
                        <p className="mt-1 text-xs font-bold text-paper/42">
                          Commission {formatCurrency(transaction.commission)}
                          {transaction.marketEligible === false ? " · no market impact" : ""}
                        </p>
                      ) : transaction.marketEligible === false ? (
                        <p className="mt-1 text-xs font-bold text-paper/42">No market impact</p>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-paper/45">No trades recorded.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
