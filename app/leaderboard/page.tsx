"use client";

import { useGame } from "@/components/GameProvider";
import { MetricCard } from "@/components/MetricCard";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import clsx from "clsx";
import { Medal, Trophy, UsersRound } from "lucide-react";

export default function LeaderboardPage() {
  const { leaderboard } = useGame();
  const currentRank = leaderboard.findIndex((entry) => entry.isCurrentUser) + 1;
  const leader = leaderboard[0];
  const rankLabel = currentRank > 0 ? `#${currentRank}` : "Unranked";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-brass">Leaderboard</p>
        <h1 className="mt-2 text-4xl font-black">Market standings</h1>
      </div>

      <section className="grid gap-3 md:grid-cols-3">
        <MetricCard
          label="Your rank"
          value={rankLabel}
          detail={`${leaderboard.length} traders`}
          icon={<Trophy className="h-4 w-4" />}
          tone="warm"
        />
        <MetricCard
          label="Leader"
          value={leader?.username ?? "N/A"}
          detail={leader ? formatCurrency(leader.portfolioValue) : "No traders yet"}
          icon={<Medal className="h-4 w-4" />}
          tone="good"
        />
        <MetricCard
          label="Field"
          value={`${leaderboard.length}`}
          detail="Public rankings"
          icon={<UsersRound className="h-4 w-4" />}
          tone="cool"
        />
      </section>

      <section className="rounded border border-line bg-panel shadow-market">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-paper/40">
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">Trader</th>
                <th className="px-4 py-3 text-right">Portfolio value</th>
                <th className="px-4 py-3 text-right">Cash</th>
                <th className="px-4 py-3 text-right">Gain</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.length ? (
                leaderboard.map((entry, index) => (
                  <tr
                    key={entry.id}
                    className={clsx(
                      "border-b border-line/70 last:border-0",
                      entry.isCurrentUser ? "bg-brass/10" : "hover:bg-panelSoft/70"
                    )}
                  >
                    <td className="px-4 py-4">
                      <span
                        className={clsx(
                          "grid h-9 w-9 place-items-center rounded-md font-black",
                          index === 0 ? "bg-brass text-white" : "border border-line bg-panelSoft text-paper/70"
                        )}
                      >
                        {index + 1}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-black">{entry.username}</div>
                      {entry.isCurrentUser ? <div className="text-sm font-bold text-brass">Current user</div> : null}
                    </td>
                    <td className="px-4 py-4 text-right font-black number-tabular">
                      {formatCurrency(entry.portfolioValue)}
                    </td>
                    <td className="px-4 py-4 text-right number-tabular text-paper/60">
                      {formatCurrency(entry.cashBalance)}
                    </td>
                    <td
                      className={clsx(
                        "px-4 py-4 text-right font-black number-tabular",
                        entry.gainPercent >= 0 ? "text-mint" : "text-ember"
                      )}
                    >
                      {formatPercent(entry.gainPercent)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-10 text-center text-paper/50" colSpan={5}>
                    No leaderboard entries yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
