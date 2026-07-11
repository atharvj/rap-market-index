"use client";

import { useAuth } from "@/components/AuthProvider";
import { useGame } from "@/components/GameProvider";
import { ArtistIdentity, ArtistMiniCard, ChangeText, RmiButton, RmiSection } from "@/components/RmiPrimitives";
import { ArtistAvatar } from "@/components/ArtistAvatar";
import { MarketNewsFeed } from "@/components/MarketNewsFeed";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import { getMarketBreadth } from "@/lib/market-analytics";
import type { Artist } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export default function HomePage() {
  const router = useRouter();
  const { session } = useAuth();
  const { state, portfolioValue, portfolioDayChange, watchlistArtists } = useGame();
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  const orderedMovers = useMemo(
    () => [...state.artists].sort((a, b) => Math.abs(b.dailyChangePercent) - Math.abs(a.dailyChangePercent)),
    [state.artists]
  );
  const trending = orderedMovers.slice(0, 8);
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
  const signalLeader = [...state.artists].sort((a, b) => b.hypeScore - a.hypeScore)[0];
  const breadth = getMarketBreadth(state.artists);
  const portfolioDayPercent = portfolioValue - portfolioDayChange > 0
    ? (portfolioDayChange / (portfolioValue - portfolioDayChange)) * 100
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
      <section className="relative z-40 grid min-w-0 overflow-visible rounded-lg border border-line bg-panel lg:grid-cols-[minmax(0,1.45fr)_minmax(290px,0.55fr)]">
        <div className="grid min-w-0 content-center px-5 py-8 text-center sm:px-8 lg:min-h-[230px] lg:text-left">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan">Rap Market Index</p>
          <h1 className="mt-3 min-w-0 break-words text-3xl font-black leading-tight sm:text-4xl">Spot the next rise.</h1>
          <p className="mt-3 text-base font-bold text-paper/75">Buy shares in rappers. Build a portfolio when they blow up.</p>
          <form onSubmit={submitSearch} className="relative mx-auto mt-6 flex w-full min-w-0 max-w-xl flex-col gap-2 sm:flex-row lg:mx-0">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => window.setTimeout(() => setSearchFocused(false), 140)}
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-panelSoft px-3 text-sm outline-none placeholder:text-paper/35 focus:border-cyan"
              placeholder="Search an artist, e.g. Ken Carson"
            />
            <RmiButton type="submit">Search</RmiButton>
            {searchFocused ? (
              <div className="absolute left-0 right-0 top-[100px] z-[100] max-h-72 overflow-y-auto rounded-lg border border-line bg-panel p-2 text-left shadow-2xl scrollbar-thin sm:right-20 sm:top-12">
                {searchSuggestions.map((artist) => (
                  <Link
                    key={artist.id}
                    href={`/artists/${artist.id}`}
                    onClick={() => setSearchFocused(false)}
                    className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 hover:bg-panelSoft"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <ArtistAvatar artist={artist} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-black">{artist.name}</span>
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

        <div className="grid divide-y divide-line border-t border-line bg-panelSoft lg:border-l lg:border-t-0">
          {marketLeader ? <PulseArtist label="Market leader" artist={marketLeader} /> : null}
          {underPressure ? <PulseArtist label="Under pressure" artist={underPressure} /> : null}
          {signalLeader ? <PulseArtist label="Signal leader" artist={signalLeader} score /> : null}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <HeroStat label="Active Listings" value={String(state.artists.length)} />
        <HeroStat label="Gaining Today" value={String(breadth.advancers)} />
        <HeroStat label="Declining Today" value={String(breadth.decliners)} />
        <HeroStat label="Average Move" value={formatPercent(breadth.averageAbsoluteMove)} />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.65fr)]">
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
          <RmiSection title={session ? "Your Portfolio" : "Start Trading"}>
            {session ? (
              <div className="grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-1">
                <SnapshotTile label="Portfolio" value={formatCurrency(portfolioValue)} />
                <SnapshotTile label="Cash" value={formatCurrency(state.cashBalance)} />
                <SnapshotTile label="Today" value={formatPercent(portfolioDayPercent)} positive={portfolioDayPercent >= 0} />
                <RmiButton href="/portfolio" variant="secondary">View Portfolio</RmiButton>
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

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-black">Trending Now</h2>
          <Link href="/markets" className="text-sm font-bold text-paper/55 hover:text-cyan">
            View Markets
          </Link>
        </div>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
          {trending.map((artist) => (
            <ArtistMiniCard key={artist.id} artist={artist} />
          ))}
        </div>
      </section>

    </div>
  );
}

function PulseArtist({ label, artist, score = false }: { label: string; artist: Artist; score?: boolean }) {
  return (
    <div className="grid content-center gap-3 p-5">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-paper/45">{label}</p>
      <div className="flex items-center justify-between gap-4">
        <ArtistIdentity artist={artist} />
        {score ? <span className="text-sm font-black text-cyan">{artist.hypeScore}/100</span> : <ChangeText value={artist.dailyChangePercent} />}
      </div>
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-panelSoft p-4">
      <p className="text-xs font-bold text-paper/65">{label}</p>
      <p className="mt-1 text-xl font-black number-tabular">{value}</p>
    </div>
  );
}

function SnapshotTile({ label, value, positive = true }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="rounded-lg bg-panelSoft p-4">
      <p className="text-xs font-bold text-paper/55">{label}</p>
      <p className={positive ? "mt-1 text-xl font-black text-paper number-tabular" : "mt-1 text-xl font-black text-ember number-tabular"}>{value}</p>
    </div>
  );
}
