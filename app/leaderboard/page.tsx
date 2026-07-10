"use client";

import { AdminBadge } from "@/components/AdminBadge";
import { useGame } from "@/components/GameProvider";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import clsx from "clsx";
import { Crown, Medal } from "lucide-react";
import Link from "next/link";

export default function LeaderboardPage() {
  const { leaderboard } = useGame();
  const current = leaderboard.find((entry) => entry.isCurrentUser);
  const podium = [leaderboard[0], leaderboard[1], current].filter(
    (entry): entry is NonNullable<typeof entry> => Boolean(entry)
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-black">Leaderboard</h1>
        <p className="mt-1 text-sm font-bold text-paper/70">RMI global league · {leaderboard.length} traders</p>
      </header>

      <div className="flex gap-2">
        <button className="rounded-lg border border-line px-4 py-2 text-sm font-black">This league</button>
        <button className="rounded-lg border border-line px-4 py-2 text-sm font-black text-paper/70">Global</button>
        <button className="rounded-lg border border-line px-4 py-2 text-sm font-black text-paper/70">Rookies</button>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        {podium.slice(0, 3).map((entry, index) => (
          <div
            key={`${entry.id}-${index}`}
            className={clsx("rmi-card grid place-items-center p-6 text-center", index === 0 && "border-cyan/70")}
          >
            {index === 0 ? <Crown className="h-5 w-5 text-brass" /> : <Medal className="h-5 w-5 text-paper/50" />}
            <Link href={`/users/${entry.id}`} className="mt-3 text-sm font-black hover:text-cyan">
              {entry.isCurrentUser ? "You" : entry.username}
            </Link>
            <p className="text-xs font-bold text-paper/60">portfolio value</p>
            <p className="mt-1 text-xl font-black text-mint number-tabular">{formatCurrency(entry.portfolioValue)}</p>
          </div>
        ))}
      </section>

      <section className="rmi-card overflow-hidden">
        <div className="grid grid-cols-[54px_minmax(0,1fr)_120px_88px] border-b border-line px-4 py-3 text-xs font-bold text-paper/45">
          <span>rank</span>
          <span>trader</span>
          <span className="text-right">value</span>
          <span className="text-right">7d change</span>
        </div>
        {leaderboard.map((entry, index) => (
          <div
            key={entry.id}
            className={clsx(
              "grid grid-cols-[54px_minmax(0,1fr)_120px_88px] items-center border-b border-line px-4 py-3 text-sm last:border-b-0",
              entry.isCurrentUser && "bg-cyan/8"
            )}
          >
            <span className="font-black">{index + 1}</span>
            <span className="flex min-w-0 items-center gap-2">
              <Link href={`/users/${entry.id}`} className="truncate font-black hover:text-cyan">
                {entry.username}
              </Link>
              {entry.isAdmin ? <AdminBadge compact /> : null}
            </span>
            <span className="text-right font-black number-tabular">{formatCurrency(entry.portfolioValue)}</span>
            <span className={entry.gainPercent >= 0 ? "text-right font-black text-mint" : "text-right font-black text-ember"}>
              {formatPercent(entry.gainPercent)}
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}
