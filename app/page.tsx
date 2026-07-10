"use client";

import { useAuth } from "@/components/AuthProvider";
import { useGame } from "@/components/GameProvider";
import { ArtistIdentity, ArtistMiniCard, ChangeText, RmiButton, RmiSection } from "@/components/RmiPrimitives";
import { ArtistAvatar } from "@/components/ArtistAvatar";
import { MarketNewsFeed } from "@/components/MarketNewsFeed";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import type { Artist } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export default function HomePage() {
  const router = useRouter();
  const { session } = useAuth();
  const { state, portfolioValue, gainPercent, watchlistArtists } = useGame();
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
      .sort((first, second) => first.name.localeCompare(second.name));
  }, [query, state.artists]);
  const marketLeader = [...state.artists].sort((a, b) => b.dailyChangePercent - a.dailyChangePercent)[0];
  const underPressure = [...state.artists].sort((a, b) => a.dailyChangePercent - b.dailyChangePercent)[0];
  const signalLeader = [...state.artists].sort((a, b) => b.hypeScore - a.hypeScore)[0];
  const advancers = state.artists.filter((artist) => artist.dailyChangePercent > 0).length;
  const decliners = state.artists.filter((artist) => artist.dailyChangePercent < 0).length;
  const averageMove = state.artists.length
    ? state.artists.reduce((total, artist) => total + Math.abs(artist.dailyChangePercent), 0) / state.artists.length
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
      <section className="grid min-w-0 overflow-hidden rounded-xl border border-line bg-panel lg:grid-cols-[minmax(0,1.45fr)_minmax(290px,0.55fr)]">
        <div className="grid min-w-0 content-center px-5 py-10 text-center sm:px-10 lg:min-h-[300px] lg:text-left">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan">Rap Market Index</p>
          <h1 className="mt-3 min-w-0 break-words text-3xl font-black leading-tight sm:text-5xl">Spot the rise before everyone else.</h1>
          <p className="mt-3 text-base font-bold text-paper/75">Buy shares in rappers. Build a portfolio when they blow up.</p>
          <form onSubmit={submitSearch} className="relative mx-auto mt-6 flex w-full min-w-0 max-w-xl gap-2 lg:mx-0">
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
              <div className="absolute left-0 right-20 top-12 z-40 max-h-72 overflow-y-auto rounded-xl border border-line bg-panel p-2 text-left shadow-2xl scrollbar-thin">
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
        <HeroStat label="active listings" value={String(state.artists.length)} />
        <HeroStat label="gaining today" value={String(advancers)} />
        <HeroStat label="declining today" value={String(decliners)} />
        <HeroStat label="average move" value={formatPercent(averageMove)} />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-black">Trending now</h2>
          <Link href="/markets" className="text-sm font-bold text-paper/55 hover:text-cyan">
            Markets
          </Link>
        </div>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
          {trending.map((artist) => (
            <ArtistMiniCard key={artist.id} artist={artist} />
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.65fr)]">
        <RmiSection
          title="Market catalysts"
          action={<Link href="/news" className="text-xs font-bold text-cyan hover:text-cyan/75">All news</Link>}
        >
          <div className="px-4">
            <MarketNewsFeed limit={5} variant="full" />
          </div>
        </RmiSection>

        <div className="space-y-4">
          <RmiSection title={session ? "Your portfolio" : "Start trading"}>
            {session ? (
              <div className="grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-1">
                <SnapshotTile label="portfolio" value={formatCurrency(portfolioValue)} />
                <SnapshotTile label="cash" value={formatCurrency(state.cashBalance)} />
                <SnapshotTile label="today" value={formatPercent(gainPercent)} positive={gainPercent >= 0} />
                <RmiButton href="/portfolio" variant="secondary">View portfolio</RmiButton>
              </div>
            ) : (
              <div className="space-y-4 p-4 text-sm">
                <p className="font-bold leading-5 text-paper/70">Create a portfolio, follow catalysts, and compete on rankings. No real money.</p>
                <RmiButton href="/account?mode=signup">Sign up</RmiButton>
              </div>
            )}
          </RmiSection>

          {session ? (
            <RmiSection title="Your watchlist" action={<Link href="/watchlist" className="text-xs text-cyan">View all</Link>}>
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
