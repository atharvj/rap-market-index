"use client";

import { useAuth } from "@/components/AuthProvider";
import { useGame } from "@/components/GameProvider";
import { ArtistIdentity, ChangeText, RmiButton, RmiSection } from "@/components/RmiPrimitives";
import { ArtistAvatar } from "@/components/ArtistAvatar";
import { MarketSideRail } from "@/components/MarketSideRail";
import { MarketNewsFeed } from "@/components/MarketNewsFeed";
import { MiniSparkline } from "@/components/MiniSparkline";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import { getMarketBreadth } from "@/lib/market-analytics";
import type { Artist } from "@/lib/types";
import { Activity, ArrowDownRight, ArrowUpRight, Gauge, Radio } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export default function HomePage() {
  const router = useRouter();
  const { session } = useAuth();
  const { state, portfolioValue, portfolioDayChange, watchlistArtists } = useGame();
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  const searchSuggestions = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return [...state.artists]
      .filter(
        (artist) =>
          !normalized ||
          artist.name.toLowerCase().includes(normalized) ||
          artist.ticker.toLowerCase().includes(normalized)
      )
      .sort((first, second) => {
        if (normalized) {
          const firstExact = first.name.toLowerCase() === normalized || first.ticker.toLowerCase() === normalized;
          const secondExact = second.name.toLowerCase() === normalized || second.ticker.toLowerCase() === normalized;

          if (firstExact !== secondExact) {
            return firstExact ? -1 : 1;
          }

          const firstStarts = first.name.toLowerCase().startsWith(normalized) || first.ticker.toLowerCase().startsWith(normalized);
          const secondStarts = second.name.toLowerCase().startsWith(normalized) || second.ticker.toLowerCase().startsWith(normalized);

          if (firstStarts !== secondStarts) {
            return firstStarts ? -1 : 1;
          }
        }

        return second.dailyChangePercent - first.dailyChangePercent || first.name.localeCompare(second.name);
      })
      .slice(0, 8);
  }, [query, state.artists]);
  const marketLeader = [...state.artists].sort((a, b) => b.dailyChangePercent - a.dailyChangePercent)[0];
  const underPressure = [...state.artists].sort((a, b) => a.dailyChangePercent - b.dailyChangePercent)[0];
  const signalLeader = [...state.artists]
    .filter((artist) => artist.id !== marketLeader?.id)
    .sort((a, b) => b.hypeScore - a.hypeScore)[0] ?? marketLeader;
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

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return;
    }

    const match = state.artists.find(
      (artist) =>
        artist.name.toLowerCase().includes(normalized) ||
        artist.ticker.toLowerCase() === normalized ||
        artist.ticker.toLowerCase().includes(normalized)
    );

    if (match) {
      setSearchFocused(false);
      router.push(`/artists/${match.id}`);
    }
  }

  return (
    <div className="space-y-6">
      <section data-testid="home-market-hero" className="rmi-card rmi-hero relative z-40 grid min-w-0 overflow-visible lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
        <div className="grid min-w-0 content-center px-5 py-9 text-center sm:px-8 lg:min-h-[260px] lg:text-left">
          <div className="relative z-10">
          <p className="rmi-kicker">Rap Market Index</p>
          <h1 className="mt-4 min-w-0 break-words text-3xl font-bold leading-[1.05] sm:text-5xl">
            Spot the next <span className="text-cyan">rise.</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm font-medium text-paper/66 sm:text-base">Buy shares in rappers. Build a portfolio when they blow up.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 lg:justify-start">
            <span className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-mint/25 bg-mint/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-mint"><span className="rmi-live-dot" /> Market online</span>
            <span className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-cyan/25 bg-cyan/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan"><Radio className="h-3 w-3" /> Verified catalysts</span>
          </div>
          <form onSubmit={submitSearch} className="relative mx-auto mt-6 flex w-full min-w-0 max-w-xl flex-col gap-2 sm:flex-row lg:mx-0">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => window.setTimeout(() => setSearchFocused(false), 140)}
              className="min-h-11 min-w-0 flex-1 rounded-[var(--radius-control)] border border-line bg-ink/70 px-3 text-sm outline-none placeholder:text-paper/30 focus:border-cyan"
              placeholder="Search an artist, e.g. Ken Carson"
            />
            <RmiButton type="submit">Search</RmiButton>
            {searchFocused ? (
              <div data-testid="home-search-results" className="rmi-popover absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[100] max-h-72 overscroll-contain overflow-y-auto p-2 text-left scrollbar-thin sm:right-[5.75rem]">
                {searchSuggestions.map((artist) => (
                  <Link
                    key={artist.id}
                    href={`/artists/${artist.id}`}
                    onClick={() => setSearchFocused(false)}
                    className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] px-3 py-2 hover:bg-cyan/5"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <ArtistAvatar artist={artist} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{artist.name}</span>
                        <span className="block text-xs text-paper/45">${artist.ticker} · {formatCurrency(artist.currentPrice)}</span>
                      </span>
                    </span>
                    <ChangeText value={artist.dailyChangePercent} />
                  </Link>
                ))}
              </div>
            ) : null}
          </form>
          </div>
        </div>

        <div className="grid divide-y divide-line/80 border-t border-line bg-ink/45 lg:border-l lg:border-t-0">
          {marketLeader ? <PulseArtist label="Top gainer" artist={marketLeader} accent="mint" /> : null}
          {underPressure ? <PulseArtist label="Under pressure" artist={underPressure} accent="ember" /> : null}
          {signalLeader ? <PulseArtist label="Strongest signal" artist={signalLeader} score accent="cyan" /> : null}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <HeroStat label="Active Listings" value={String(state.artists.length)} accent="cyan" icon={<Activity className="h-4 w-4" />} />
        <HeroStat label="Gaining Today" value={String(breadth.advancers)} accent="mint" icon={<ArrowUpRight className="h-4 w-4" />} />
        <HeroStat label="Declining Today" value={String(breadth.decliners)} accent="ember" icon={<ArrowDownRight className="h-4 w-4" />} />
        <HeroStat label="Average Move" value={formatPercent(breadth.averageAbsoluteMove)} accent="brass" icon={<Gauge className="h-4 w-4" />} />
      </section>

      <RmiSection
        title="Live Signal Deck"
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
          subtitle="Verified stories with enough evidence and relevance to inform an RMI quote."
          action={<Link href="/news" className="text-xs font-bold text-cyan hover:text-cyan/75">All News</Link>}
        >
          <div className="px-4">
            <MarketNewsFeed limit={5} variant="full" />
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

function PulseArtist({ label, artist, score = false, accent }: { label: string; artist: Artist; score?: boolean; accent: "mint" | "ember" | "cyan" }) {
  return (
    <div className="relative grid content-center gap-3 overflow-hidden p-5">
      <span className={accent === "mint" ? "absolute inset-y-0 left-0 w-0.5 bg-mint" : accent === "ember" ? "absolute inset-y-0 left-0 w-0.5 bg-ember" : "absolute inset-y-0 left-0 w-0.5 bg-cyan"} />
      <p className="rmi-data-label">{label}</p>
      <div className="flex items-center justify-between gap-4">
        <ArtistIdentity artist={artist} />
        {score ? <span className="text-sm font-semibold text-cyan">{artist.hypeScore}/100</span> : <ChangeText value={artist.dailyChangePercent} />}
      </div>
    </div>
  );
}

function HeroStat({ label, value, accent, icon }: { label: string; value: string; accent: "cyan" | "mint" | "ember" | "brass"; icon: React.ReactNode }) {
  return (
    <div className={`rmi-metric rmi-metric-${accent} p-4`}>
      <div className="flex items-center justify-between gap-2">
        <p className="rmi-data-label">{label}</p>
        <span className={accent === "cyan" ? "text-cyan" : accent === "mint" ? "text-mint" : accent === "ember" ? "text-ember" : "text-brass"}>{icon}</span>
      </div>
      <p className="mt-2 text-xl font-bold number-tabular">{value}</p>
    </div>
  );
}
