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
      <section className="rmi-hero market-grid rmi-noise overflow-hidden">
        <div className="grid gap-6 p-6 sm:p-9 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-md border border-violet/45 bg-violet/15 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-violet shadow-[0_0_24px_rgba(var(--color-violet),0.16)]"><span className="h-2 w-2 rounded-full bg-violet" /> Coming Soon</span>
            <h1 className="mt-5 text-3xl font-black sm:text-5xl">Build a league. Trade against your friends.</h1>
            <p className="mt-4 max-w-xl text-sm font-semibold leading-6 text-paper/60">
              Create private groups, invite friends, and compete on portfolio returns.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <RmiButton href="/leaderboard">View Global Rankings <ArrowUpRight className="ml-2 h-4 w-4" /></RmiButton>
              <RmiButton href="/markets" variant="secondary">Explore Markets</RmiButton>
            </div>
          </div>
          <div className="rmi-signal-card relative overflow-hidden p-5">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-cyan via-violet to-mint" />
            <div className="flex items-center justify-between">
              <span className="rmi-data-label">League Preview</span>
              <span className="rmi-status-chip border-violet/30 bg-violet/10 text-violet">Coming Soon</span>
            </div>
            <div className="mt-8 grid place-items-center py-6">
              <ShieldCheck className="h-16 w-16 text-violet" strokeWidth={1.25} aria-hidden="true" />
            </div>
            <div className="grid grid-cols-3 gap-2 border-t border-line pt-4 text-center">
              <LeagueSignal value="Private" label="Access" />
              <LeagueSignal value="Ranked" label="Standings" />
              <LeagueSignal value="Social" label="Competition" />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {plannedFeatures.map(({ icon: Icon, title, detail }, index) => (
          <article key={title} className="rmi-signal-card market-grid group p-5">
            <div className="flex items-center justify-between">
              <span className="grid h-9 w-9 place-items-center rounded-md bg-cyan/10 text-cyan"><Icon className="h-4 w-4" aria-hidden="true" /></span>
              <span className="number-tabular text-xs font-black text-paper/25">0{index + 1}</span>
            </div>
            <h2 className="mt-4 text-base font-black">{title}</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-paper/55">{detail}</p>
          </article>
        ))}
      </section>

      <section className="rmi-card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="rmi-kicker text-violet">Coming Soon</p>
          <p className="mt-2 text-sm font-black">Build your portfolio now.</p>
          <p className="mt-1 text-xs font-semibold text-paper/45">Bring it into private competition with friends when leagues open.</p>
        </div>
        <RmiButton href="/portfolio" variant="secondary">Open Portfolio</RmiButton>
      </section>
    </div>
  );
}

function LeagueSignal({ value, label }: { value: string; label: string }) {
  return <div><p className="text-xs font-black text-paper">{value}</p><p className="mt-1 text-[9px] font-black uppercase text-paper/35">{label}</p></div>;
}
