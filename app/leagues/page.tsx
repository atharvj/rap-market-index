"use client";

import { RmiButton } from "@/components/RmiPrimitives";
import { ArrowUpRight, MessageCircle, ShieldCheck, Trophy, UsersRound } from "lucide-react";

const plannedFeatures = [
  { icon: UsersRound, title: "Private Leagues", detail: "Invite friends and compare portfolios in a private table." },
  { icon: Trophy, title: "League Rankings", detail: "See who builds the strongest portfolio over time." },
  { icon: MessageCircle, title: "League Activity", detail: "Follow trades and league updates in one private feed." }
];

export default function LeaguesPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="grid gap-8 border-b border-line py-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
          <div>
            <span className="rmi-status-chip border-cyan/35 bg-cyan/10 text-cyan"><span className="h-2 w-2 rounded-full bg-cyan" /> Coming Soon</span>
            <h1 className="mt-5 text-3xl font-bold sm:text-5xl">Build a league. Trade against your friends.</h1>
            <p className="mt-4 max-w-xl text-sm font-normal leading-6 text-paper/60">
              Create private groups, invite friends, and compete on portfolio returns.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <RmiButton href="/leaderboard">View Global Rankings <ArrowUpRight className="ml-2 h-4 w-4" /></RmiButton>
              <RmiButton href="/markets" variant="secondary">Explore Markets</RmiButton>
            </div>
          </div>
          <aside className="border-l border-line pl-6">
            <div className="flex items-center justify-between">
              <span className="rmi-data-label">League Preview</span>
              <ShieldCheck className="h-6 w-6 text-cyan" strokeWidth={1.5} aria-hidden="true" />
            </div>
            <p className="mt-4 text-sm leading-6 text-paper/55">A focused competition layer built around the same artist quotes and portfolio rules as the global market.</p>
            <div className="mt-6 grid grid-cols-3 gap-2 border-t border-line pt-4 text-center">
              <LeagueSignal value="Private" label="Access" />
              <LeagueSignal value="Ranked" label="Standings" />
              <LeagueSignal value="Social" label="Competition" />
            </div>
          </aside>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {plannedFeatures.map(({ icon: Icon, title, detail }, index) => (
          <article key={title} className="rmi-signal-card p-5">
            <div className="flex items-center justify-between">
              <span className="grid h-9 w-9 place-items-center rounded-md bg-cyan/10 text-cyan"><Icon className="h-4 w-4" aria-hidden="true" /></span>
              <span className="number-tabular text-xs font-semibold text-paper/25">0{index + 1}</span>
            </div>
            <h2 className="mt-4 text-base font-semibold">{title}</h2>
            <p className="mt-2 text-sm font-normal leading-6 text-paper/55">{detail}</p>
          </article>
        ))}
      </section>

      <section className="flex flex-wrap items-center justify-between gap-4 border-t border-line py-6">
        <div>
          <p className="rmi-kicker text-cyan">Prepare Your Portfolio</p>
          <p className="mt-2 text-sm font-semibold">Start building your track record.</p>
          <p className="mt-1 text-xs font-normal text-paper/45">Your existing portfolio will be ready for private competition when leagues open.</p>
        </div>
        <RmiButton href="/portfolio" variant="secondary">Open Portfolio</RmiButton>
      </section>
    </div>
  );
}

function LeagueSignal({ value, label }: { value: string; label: string }) {
  return <div><p className="text-xs font-semibold text-paper">{value}</p><p className="mt-1 text-[10px] font-semibold uppercase text-paper/35">{label}</p></div>;
}
