"use client";

import { ArtistAvatar } from "@/components/ArtistAvatar";
import { ChangePill } from "@/components/ChangePill";
import { useGame } from "@/components/GameProvider";
import { MiniSparkline } from "@/components/MiniSparkline";
import { TradeTicket } from "@/components/TradeTicket";
import { formatCurrency, formatPercent, formatShares } from "@/lib/formatters";
import { STARTING_CASH } from "@/lib/market";
import { Clock3, LineChart, WalletCards } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

export default function PortfolioPage() {
  const { holdings, portfolioValue, portfolioDayChange, state, getArtist } = useGame();
  const [selectedArtistId, setSelectedArtistId] = useState(holdings[0]?.artistId ?? "");
  const selectedArtist = getArtist(selectedArtistId) ?? holdings[0]?.artist;
  const investedValue = holdings.reduce((total, holding) => total + holding.currentValue, 0);
  const totalCost = holdings.reduce((total, holding) => total + holding.costBasis, 0);
  const totalProfitLoss = investedValue - totalCost;
  const suggestedArtists = useMemo(
    () => [...state.artists].sort((a, b) => b.hypeScore - a.hypeScore).slice(0, 4),
    [state.artists]
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-brass">Portfolio</p>
        <h1 className="mt-2 text-4xl font-black">My Portfolio</h1>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded border border-line bg-panel p-5 shadow-market">
          <h2 className="text-2xl font-black">Account summary</h2>
          <div className="mt-4 rounded bg-brass/15 px-4 py-3 text-center">
            <span className="text-sm font-bold text-paper/55">Net Worth</span>{" "}
            <span className="text-2xl font-black number-tabular">{formatCurrency(portfolioValue)}</span>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-xl font-black number-tabular">{formatCurrency(state.cashBalance)}</p>
              <p className="text-xs font-bold uppercase tracking-wide text-paper/45">Cash</p>
            </div>
            <div>
              <p className="text-xl font-black number-tabular">{formatCurrency(investedValue)}</p>
              <p className="text-xs font-bold uppercase tracking-wide text-paper/45">Investments</p>
            </div>
          </div>
          <div className="mt-5 border-t border-line pt-3 text-sm font-bold text-paper/55">
            Logged in as <span className="text-paper">{state.username}</span>
          </div>
        </div>

        <div className="rounded border border-line bg-panel p-5 shadow-market">
          <div className="flex items-center gap-2">
            <LineChart className="h-5 w-5 text-brass" aria-hidden="true" />
            <h2 className="text-2xl font-black">Performance</h2>
          </div>
          <div className="mt-4 text-center">
            <p className={portfolioDayChange >= 0 ? "text-3xl font-black text-mint" : "text-3xl font-black text-ember"}>
              {formatCurrency(portfolioDayChange)}
            </p>
            <p className="text-xs font-bold uppercase tracking-wide text-paper/45">Change today</p>
          </div>
          <div className="mt-5 grid grid-cols-4 gap-3 border-t border-line pt-4 text-center">
            <PerformanceStat label="Week" value="0.00%" />
            <PerformanceStat label="Month" value="0.00%" />
            <PerformanceStat label="YTD" value="0.00%" />
            <PerformanceStat label="Lifetime" value={formatPercent(((portfolioValue - STARTING_CASH) / STARTING_CASH) * 100)} />
          </div>
        </div>
      </section>

      <section className="rounded border border-brass/55 bg-panel shadow-market">
        <div className="border-b border-brass/35 bg-brass/10 px-4 py-3">
          <h2 className="text-sm font-black uppercase tracking-wide">Popular artists to watch</h2>
        </div>
        <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
          {suggestedArtists.map((artist) => (
            <Link key={artist.id} href={`/artists/${artist.id}`} className="min-w-0">
              <div className="flex items-center gap-3">
                <ArtistAvatar artist={artist} />
                <div className="min-w-0">
                  <p className="truncate font-black">{artist.name}</p>
                  <p className="text-sm font-bold text-paper/50">
                    {artist.ticker} · {formatCurrency(artist.currentPrice)}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-[1fr_110px] items-center gap-3">
                <ChangePill value={artist.dailyChangePercent} />
                <MiniSparkline data={artist.priceHistory} positive={artist.dailyChangePercent >= 0} />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded border border-line bg-panel shadow-market">
          <div className="border-b border-line p-4">
            <h2 className="text-xl font-black">Holdings</h2>
          </div>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[820px] border-collapse">
              <thead>
                <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-paper/40">
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
                      className="cursor-pointer border-b border-line last:border-0 hover:bg-panelSoft/70"
                      onClick={() => setSelectedArtistId(holding.artistId)}
                    >
                      <td className="px-4 py-3">
                        <Link href={`/artists/${holding.artistId}`} className="flex items-center gap-3">
                          <ArtistAvatar artist={holding.artist} />
                          <span>
                            <span className="block font-black">{holding.artist.name}</span>
                            <span className="text-sm font-bold text-paper/50">{holding.artist.ticker}</span>
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
                    <td className="px-4 py-10 text-center text-paper/50" colSpan={6}>
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

          <section className="rounded border border-line bg-panel p-4 shadow-market">
            <div className="mb-4 flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-brass" aria-hidden="true" />
              <h2 className="text-lg font-black">Recent trades</h2>
            </div>
            <div className="max-h-80 space-y-3 overflow-auto pr-1 scrollbar-thin">
              {state.transactions.length ? (
                state.transactions.slice(0, 8).map((transaction) => {
                  const artist = getArtist(transaction.artistId);

                  return (
                    <div key={transaction.id} className="rounded border border-line bg-panelSoft p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-black uppercase">{transaction.type}</span>
                        <span className="text-sm font-bold text-paper/50">{artist?.ticker ?? "N/A"}</span>
                      </div>
                      <p className="mt-2 text-sm text-paper/60">
                        {formatShares(transaction.shares)} shares at {formatCurrency(transaction.price)}
                      </p>
                      {typeof transaction.commission === "number" && transaction.commission > 0 ? (
                        <p className="mt-1 text-xs font-bold text-paper/40">
                          Commission {formatCurrency(transaction.commission)}
                          {transaction.marketEligible === false ? " · no market impact" : ""}
                        </p>
                      ) : transaction.marketEligible === false ? (
                        <p className="mt-1 text-xs font-bold text-paper/40">No market impact</p>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-paper/50">No trades recorded.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function PerformanceStat({ label, value }: { label: string; value: string }) {
  const positive = !value.startsWith("-");

  return (
    <div>
      <p className={positive ? "font-black text-mint number-tabular" : "font-black text-ember number-tabular"}>{value}</p>
      <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-paper/40">{label}</p>
    </div>
  );
}
