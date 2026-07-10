"use client";

import { useGame } from "@/components/GameProvider";
import { RmiButton } from "@/components/RmiPrimitives";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import { Trophy, UsersRound } from "lucide-react";
import Link from "next/link";

export default function LeaguesPage() {
  const { leaderboard, portfolioValue, gainPercent } = useGame();

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-black">Leagues</h1>
        <p className="mt-1 text-sm font-bold text-paper/70">Private friend leagues are a future layer. Global competition is live now.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <article className="rmi-card p-5">
          <Trophy className="h-5 w-5 text-brass" />
          <h2 className="mt-4 text-xl font-black">RMI Global</h2>
          <p className="mt-1 text-sm font-bold text-paper/65">{leaderboard.length} traders · public rankings</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <LeagueStat label="portfolio" value={formatCurrency(portfolioValue)} />
            <LeagueStat label="today" value={formatPercent(gainPercent)} />
          </div>
          <div className="mt-5">
            <RmiButton href="/leaderboard">View rankings</RmiButton>
          </div>
        </article>

        <article className="rmi-card p-5">
          <UsersRound className="h-5 w-5 text-cyan" />
          <h2 className="mt-4 text-xl font-black">Underground Draft</h2>
          <p className="mt-1 text-sm font-bold text-paper/65">Draft boards, invites, and league chat will land after the core market is public-ready.</p>
          <div className="mt-5">
            <Link href="/scout" className="text-sm font-black text-cyan hover:text-cyan/75">
              Scout artists first
            </Link>
          </div>
        </article>
      </section>
    </div>
  );
}

function LeagueStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-panelSoft p-3">
      <p className="text-xs font-bold text-paper/45">{label}</p>
      <p className="text-lg font-black number-tabular">{value}</p>
    </div>
  );
}
