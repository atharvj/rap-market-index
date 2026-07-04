"use client";

import { useGame } from "@/components/GameProvider";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import clsx from "clsx";
import {
  Activity,
  BarChart3,
  Landmark,
  Star,
  UserCircle,
  Trophy,
  WalletCards
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Market", icon: BarChart3 },
  { href: "/watchlist", label: "Watchlist", icon: Star },
  { href: "/portfolio", label: "Portfolio", icon: WalletCards },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/account", label: "Account", icon: UserCircle }
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { portfolioValue, state, gainPercent } = useGame();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-ink/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/" className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-md border border-brass/35 bg-panel text-brass">
                <Landmark className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="text-lg font-black leading-tight">Rap Market Index</p>
            </Link>

            <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
              <div className="rounded-md border border-line bg-panel/80 px-3 py-2">
                <span className="text-paper/45">Cash </span>
                <span className="font-black number-tabular">{formatCurrency(state.cashBalance)}</span>
              </div>
              <div className="rounded-md border border-line bg-panel/80 px-3 py-2">
                <span className="text-paper/45">Portfolio </span>
                <span className="font-black number-tabular">{formatCurrency(portfolioValue)}</span>
              </div>
              <div
                className={clsx(
                  "rounded-md border px-3 py-2 font-black number-tabular",
                  gainPercent >= 0
                    ? "border-mint/30 bg-mint/10 text-mint"
                    : "border-ember/30 bg-ember/10 text-ember"
                )}
              >
                {formatPercent(gainPercent)}
              </div>
            </div>
          </div>

          <nav className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin" aria-label="Primary">
            {navItems.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-bold transition",
                    active
                      ? "border-brass bg-brass text-ink"
                      : "border-line bg-panel/65 text-paper/65 hover:border-paper/35 hover:text-paper"
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="market-grid mx-auto min-h-[calc(100vh-11rem)] max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>

      <footer className="border-t border-line bg-ink px-4 py-5 text-center text-xs font-bold uppercase tracking-wide text-paper/42">
        <span className="inline-flex items-center gap-2">
          <Activity className="h-3.5 w-3.5" aria-hidden="true" />
          Fantasy rap trading game. No real money. No cash-out. Not affiliated with any artists.
        </span>
      </footer>
    </div>
  );
}
