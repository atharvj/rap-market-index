"use client";

import { RmiButton } from "@/components/RmiPrimitives";
import { MessageCircle, ShieldCheck, Trophy, UsersRound } from "lucide-react";

const plannedFeatures = [
  { icon: UsersRound, title: "Private Leagues", detail: "Invite friends and compare portfolios in a private table." },
  { icon: Trophy, title: "League Rankings", detail: "Compete on return without changing the public artist market." },
  { icon: MessageCircle, title: "League Activity", detail: "Follow trades and league updates in one private feed." }
];

export default function LeaguesPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="rmi-card overflow-hidden">
        <div className="grid gap-6 p-7 sm:p-10 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center">
          <div>
            <span className="inline-flex rounded-full bg-cyan/12 px-3 py-1 text-xs font-black text-cyan">Coming Soon</span>
            <h1 className="mt-4 text-3xl font-black sm:text-4xl">Trade With Your Friends</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-paper/65">
              Create private groups, compare returns, and compete with friends. Leagues are coming after the core market launch.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <RmiButton href="/leaderboard">View Global Rankings</RmiButton>
              <RmiButton href="/markets" variant="secondary">Explore Markets</RmiButton>
            </div>
          </div>
          <div className="grid place-items-center rounded-lg bg-panelSoft p-10">
            <ShieldCheck className="h-16 w-16 text-cyan" strokeWidth={1.35} aria-hidden="true" />
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {plannedFeatures.map(({ icon: Icon, title, detail }) => (
          <article key={title} className="rmi-card p-5">
            <Icon className="h-5 w-5 text-cyan" aria-hidden="true" />
            <h2 className="mt-4 text-base font-black">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-paper/55">{detail}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
