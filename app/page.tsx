"use client";

import { useAuth } from "@/components/AuthProvider";
import { useGame } from "@/components/GameProvider";
import { ArtistIdentity, ChangeText, RmiButton, RmiSection } from "@/components/RmiPrimitives";
import { MarketSideRail } from "@/components/MarketSideRail";
import { MarketNewsFeed } from "@/components/MarketNewsFeed";
import { MiniSparkline } from "@/components/MiniSparkline";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import { getMarketBreadth } from "@/lib/market-analytics";
import { Activity, ArrowDownRight, ArrowUpRight, Gauge } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

export default function HomePage() {
  const { session } = useAuth();
  const { state, portfolioValue, portfolioDayChange, watchlistArtists } = useGame();
  const breadth = getMarketBreadth(state.artists);
  const signalDeck = useMemo(
    () =>
      [...state.artists]
        .sort(
          (first, second) =>
            Math.abs(second.dailyChangePercent) + second.hypeScore / 35 -
              (Math.abs(first.dailyChangePercent) + first.hypeScore / 35) ||
            second.hypeScore - first.hypeScore
        )
        .slice(0, 6),
    [state.artists]
  );
  const portfolioDayPercent = portfolioValue - portfolioDayChange > 0
    ? (portfolioDayChange / (portfolioValue - portfolioDayChange)) * 100
    : 0;
  const investedValue = Math.max(0, portfolioValue - state.cashBalance);
  const investedPercent = portfolioValue > 0
    ? Math.min(100, Math.max(0, (investedValue / portfolioValue) * 100))
    : 0;

  return (
    <div className="space-y-6">
      <section data-testid="home-market-hero" aria-label="Top market story">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="rmi-kicker">Top Market Story</p>
            <p className="mt-1 text-sm font-medium text-paper/52">
              The highest-ranked verified music catalyst in the market right now.
            </p>
          </div>
          <Link href="/news" className="shrink-0 text-xs font-semibold text-cyan hover:text-paper">
            All News
          </Link>
        </div>
        <MarketNewsFeed limit={1} variant="home" />
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <HeroStat label="Active Listings" value={String(state.artists.length)} accent="cyan" icon={<Activity className="h-4 w-4" />} />
        <HeroStat label="Gaining Today" value={String(breadth.advancers)} accent="mint" icon={<ArrowUpRight className="h-4 w-4" />} />
        <HeroStat label="Declining Today" value={String(breadth.decliners)} accent="ember" icon={<ArrowDownRight className="h-4 w-4" />} />
        <HeroStat label="Average Move" value={formatPercent(breadth.averageAbsoluteMove)} accent="brass" icon={<Gauge className="h-4 w-4" />} />
      </section>

      <RmiSection
        title="Market Signals"
        subtitle="Artists with the strongest combination of market movement and current RMI signal."
        action={<Link href="/markets" className="text-xs font-semibold text-cyan hover:text-paper">Open Markets</Link>}
      >
        <div className="grid gap-px bg-line/70 sm:grid-cols-2 xl:grid-cols-3">
          {signalDeck.map((artist, index) => (
            <Link key={artist.id} href={`/artists/${artist.id}`} className="group bg-panel px-4 py-4 transition-colors hover:bg-cyan/[0.045]">
              <div className="flex items-start justify-between gap-3">
                <ArtistIdentity artist={artist} linked={false} />
                <span className="rmi-data-label text-cyan/65">0{index + 1}</span>
              </div>
              <div className="mt-4 flex items-end justify-between gap-4">
                <div>
                  <p className="text-lg font-bold number-tabular">{formatCurrency(artist.currentPrice)}</p>
                  <ChangeText value={artist.dailyChangePercent} />
                </div>
                <MiniSparkline data={artist.priceHistory} positive={artist.dailyChangePercent >= 0} width={118} height={38} />
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2">
                <span className="rmi-data-label">RMI signal</span>
                <span className="text-xs font-semibold text-cyan number-tabular">{artist.hypeScore}/100</span>
              </div>
            </Link>
          ))}
        </div>
      </RmiSection>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.65fr)]">
        <RmiSection
          title="Market Catalysts"
          subtitle="More verified music stories, ranked by impact, confidence, recency, source quality, and reach."
          action={<Link href="/news" className="text-xs font-bold text-cyan hover:text-cyan/75">All News</Link>}
        >
          <div className="px-4">
            <MarketNewsFeed limit={9} skip={1} variant="full" />
          </div>
        </RmiSection>

        <div className="space-y-4">
          <MarketSideRail includeWatchlist={false} listSize={5} />

          <RmiSection title={session ? "Your Portfolio" : "Start Trading"}>
            {session ? (
              <div className="space-y-4 p-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="rmi-data-label">Total Value</p>
                    <p className="mt-1 text-2xl font-bold number-tabular">{formatCurrency(portfolioValue)}</p>
                  </div>
                  <div className="text-right">
                    <p className="rmi-data-label">Today</p>
                    <p className={`mt-1 text-base font-semibold number-tabular ${portfolioDayPercent >= 0 ? "text-mint" : "text-ember"}`}>
                      {formatPercent(portfolioDayPercent)}
                    </p>
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3 text-[10px] font-bold text-paper/45">
                    <span>Portfolio Allocation</span>
                    <span className="number-tabular">{investedPercent.toFixed(0)}% invested</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-panelSoft">
                    <div className="h-full rounded-full bg-cyan" style={{ width: `${investedPercent}%` }} />
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-3 border-t border-line/70 pt-3">
                  <div>
                    <dt className="rmi-data-label">Invested</dt>
                    <dd className="mt-1 text-sm font-semibold number-tabular">{formatCurrency(investedValue)}</dd>
                  </div>
                  <div>
                    <dt className="rmi-data-label">Cash</dt>
                    <dd className="mt-1 text-sm font-semibold number-tabular">{formatCurrency(state.cashBalance)}</dd>
                  </div>
                </dl>
                <RmiButton href="/portfolio" variant="secondary" className="w-full">View Portfolio</RmiButton>
              </div>
            ) : (
              <div className="space-y-4 p-4 text-sm">
                <p className="font-bold leading-5 text-paper/70">Create a portfolio, follow catalysts, and compete on rankings. No real money.</p>
                <RmiButton href="/account?mode=signup">Sign up</RmiButton>
              </div>
            )}
          </RmiSection>

          {session ? (
            <RmiSection title="Your Watchlist" action={<Link href="/watchlist" className="text-xs text-cyan">View All</Link>}>
              {watchlistArtists.length ? (
                watchlistArtists.slice(0, 5).map((artist) => (
                  <div key={artist.id} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
                    <ArtistIdentity artist={artist} />
                    <ChangeText value={artist.dailyChangePercent} />
                  </div>
                ))
              ) : (
                <div className="p-4 text-sm leading-6 text-paper/60">
                  Save artists with the star button to track them here.
                </div>
              )}
            </RmiSection>
          ) : null}
        </div>
      </div>

    </div>
  );
}

function HeroStat({ label, value, accent, icon }: { label: string; value: string; accent: "cyan" | "mint" | "ember" | "brass"; icon: React.ReactNode }) {
  return (
    <div className="rmi-metric p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="rmi-data-label">{label}</p>
        <span className={accent === "cyan" ? "text-cyan" : accent === "mint" ? "text-mint" : accent === "ember" ? "text-ember" : "text-brass"}>{icon}</span>
      </div>
      <p className="mt-2 text-xl font-bold number-tabular">{value}</p>
    </div>
  );
}
