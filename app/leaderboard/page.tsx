"use client";

import { AdminBadge } from "@/components/AdminBadge";
import { ArtistIdentity, ChangeText, RmiButton } from "@/components/RmiPrimitives";
import { useGame } from "@/components/GameProvider";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import clsx from "clsx";
import { Crown, Medal, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";

export default function LeaderboardPage() {
  const { leaderboard, portfolioValue, gainPercent, state } = useGame();
  const current = leaderboard.find((entry) => entry.isCurrentUser);
  const currentRank = current ? leaderboard.findIndex((entry) => entry.id === current.id) + 1 : null;
  const leader = leaderboard[0];
  const medianPortfolio = leaderboard.length
    ? [...leaderboard].sort((first, second) => first.portfolioValue - second.portfolioValue)[Math.floor((leaderboard.length - 1) / 2)]?.portfolioValue ?? 0
    : 0;
  const leaderGap = leader ? Math.max(0, leader.portfolioValue - portfolioValue) : 0;
  const sortedReturns = leaderboard.map((entry) => entry.gainPercent).sort((first, second) => first - second);
  const lowestReturn = sortedReturns[0] ?? 0;
  const highestReturn = sortedReturns.at(-1) ?? 0;
  const medianReturn = sortedReturns[Math.floor((sortedReturns.length - 1) / 2)] ?? 0;
  const podium = Array.from(
    new Map(
      [leaderboard[0], leaderboard[1], leaderboard[2], current]
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
        .map((entry) => [entry.id, entry])
    ).values()
  ).slice(0, 3);
  const movers = [...state.artists].sort((a, b) => Math.abs(b.dailyChangePercent) - Math.abs(a.dailyChangePercent)).slice(0, 4);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <main className="min-w-0 space-y-5">
        <header>
          <h1 className="text-3xl font-black">Leaderboard</h1>
          <p className="mt-1 text-sm text-paper/65">Global rankings by fantasy portfolio value, updated from current market quotes.</p>
        </header>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <RankingStat label="Traders Ranked" value={String(leaderboard.length)} />
          <RankingStat label="Your Rank" value={currentRank ? `#${currentRank}` : "Unranked"} />
          <RankingStat label="Median Portfolio" value={formatCurrency(medianPortfolio)} />
          <RankingStat label="Gap to Leader" value={formatCurrency(leaderGap)} />
        </section>

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

        <section className="rmi-card overflow-x-auto">
        <div className="min-w-[650px]">
        <div className="grid grid-cols-[54px_minmax(0,1fr)_120px_110px_88px] border-b border-line px-4 py-3 text-xs font-bold text-paper/45">
          <span>rank</span>
          <span>trader</span>
          <span className="text-right">value</span>
          <span className="text-right">invested</span>
          <span className="text-right">all-time</span>
        </div>
        {leaderboard.map((entry, index) => (
          <div
            key={entry.id}
            className={clsx(
              "grid grid-cols-[54px_minmax(0,1fr)_120px_110px_88px] items-center border-b border-line px-4 py-3 text-sm last:border-b-0",
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
            <span className="text-right font-black number-tabular">{formatCurrency(Math.max(0, entry.portfolioValue - entry.cashBalance))}</span>
            <span className={entry.gainPercent >= 0 ? "text-right font-black text-mint" : "text-right font-black text-ember"}>
              {formatPercent(entry.gainPercent)}
            </span>
          </div>
        ))}
        </div>
        </section>

        <section className="rmi-card p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-base font-black">Return Distribution</h2>
              <p className="mt-1 text-sm text-paper/55">All-time fantasy returns across every ranked account.</p>
            </div>
            <span className="text-xs font-bold text-paper/45">Marked to current artist quotes</span>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <ReturnStat label="Lowest" value={lowestReturn} />
            <ReturnStat label="Median" value={medianReturn} />
            <ReturnStat label="Highest" value={highestReturn} />
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-panelSoft">
            <div
              className="h-full rounded-full bg-cyan"
              style={{
                width: `${Math.max(4, Math.min(100, ((gainPercent - lowestReturn) / Math.max(0.01, highestReturn - lowestReturn)) * 100))}%`
              }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-paper/45">
            <span>{formatPercent(lowestReturn)}</span>
            <span>Your position</span>
            <span>{formatPercent(highestReturn)}</span>
          </div>
        </section>
      </main>

      <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <section className="rmi-card p-5">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-paper/45">Your Standing</p>
          <p className="mt-3 text-3xl font-black number-tabular">{formatCurrency(portfolioValue)}</p>
          <p className={gainPercent >= 0 ? "mt-1 text-sm font-black text-mint" : "mt-1 text-sm font-black text-ember"}>
            {formatPercent(gainPercent)} all time
          </p>
          <div className="mt-5"><RmiButton href="/portfolio" variant="secondary">Open Portfolio</RmiButton></div>
        </section>

        <section className="rmi-card overflow-hidden">
          <div className="border-b border-line px-4 py-3"><h2 className="text-sm font-black">Market Movers</h2></div>
          {movers.map((artist) => (
            <div key={artist.id} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
              <ArtistIdentity artist={artist} />
              <ChangeText value={artist.dailyChangePercent} />
            </div>
          ))}
        </section>

        <section className="rmi-card p-5">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-cyan" aria-hidden="true" />
            <h2 className="text-sm font-black">How Rankings Work</h2>
          </div>
          <div className="mt-4 space-y-3 text-sm leading-5 text-paper/55">
            <p>Rank is determined by cash plus the live value of long positions and short equity.</p>
            <p>Every trader starts from the same fantasy-cash balance, so returns remain comparable.</p>
            <p>Open a trader name to view the public portfolio information they share.</p>
          </div>
        </section>

        <div className="flex items-start gap-2 px-1 text-xs leading-5 text-paper/45">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mint" aria-hidden="true" />
          <p>Admin trades are excluded from price-demand signals and cannot move artist quotes.</p>
        </div>
      </aside>
    </div>
  );
}

function RankingStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-panelSoft p-4">
      <p className="text-xs font-bold text-paper/50">{label}</p>
      <p className="mt-1 text-xl font-black number-tabular">{value}</p>
    </div>
  );
}

function ReturnStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-panelSoft p-3 text-center">
      <p className="text-xs text-paper/45">{label}</p>
      <p className={value >= 0 ? "mt-1 font-black text-mint number-tabular" : "mt-1 font-black text-ember number-tabular"}>
        {formatPercent(value)}
      </p>
    </div>
  );
}
