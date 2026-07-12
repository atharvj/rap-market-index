"use client";

import { ArtistAvatar } from "@/components/ArtistAvatar";
import { useAuth } from "@/components/AuthProvider";
import { useGame } from "@/components/GameProvider";
import { MarketNewsFeed } from "@/components/MarketNewsFeed";
import { SignedInGate } from "@/components/SignedInGate";
import { ArtistIdentity, ChangeText, RmiButton, RmiSection } from "@/components/RmiPrimitives";
import { WatchlistButton } from "@/components/WatchlistButton";
import { formatCurrency } from "@/lib/formatters";
import { getMarketBreadth } from "@/lib/market-analytics";
import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

export default function WatchlistPage() {
  const { session } = useAuth();
  const { state, watchlistArtistIds, watchlistArtists } = useGame();
  const [addQuery, setAddQuery] = useState("");
  const [addFocused, setAddFocused] = useState(false);
  const breadth = getMarketBreadth(watchlistArtists);
  const biggestMover = [...watchlistArtists].sort(
    (first, second) => Math.abs(second.dailyChangePercent) - Math.abs(first.dailyChangePercent)
  )[0];
  const signalLeader = [...watchlistArtists].sort((first, second) => second.hypeScore - first.hypeScore)[0];
  const addSuggestions = useMemo(() => {
    const normalized = addQuery.trim().toLowerCase();

    return state.artists
      .filter(
        (artist) =>
          !watchlistArtistIds.includes(artist.id) &&
          (!normalized || artist.name.toLowerCase().includes(normalized) || artist.ticker.toLowerCase().includes(normalized))
      )
      .sort((first, second) => second.dailyChangePercent - first.dailyChangePercent || first.name.localeCompare(second.name))
      .slice(0, 7);
  }, [addQuery, state.artists, watchlistArtistIds]);

  if (!session) {
    return (
      <SignedInGate
        title="Log in to use a watchlist"
        description="Saved artists and personalized catalyst updates belong to your account and are not available while signed out."
      />
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">Watchlist</h1>
          <p className="mt-1 text-sm font-bold text-paper/70">{watchlistArtists.length} artists you're tracking</p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/35" aria-hidden="true" />
          <input
            value={addQuery}
            onChange={(event) => setAddQuery(event.target.value)}
            onFocus={() => setAddFocused(true)}
            onBlur={() => window.setTimeout(() => setAddFocused(false), 140)}
            className="h-10 w-full rounded-lg border border-line bg-panel pl-9 pr-3 text-sm outline-none placeholder:text-paper/35 focus:border-cyan"
            placeholder="Add an artist"
            aria-label="Add an artist to your watchlist"
          />
          {addFocused ? (
            <div className="absolute left-0 right-0 top-12 z-50 max-h-80 overflow-y-auto rounded-lg border border-line bg-panel p-1 shadow-2xl scrollbar-thin">
              {addSuggestions.length ? addSuggestions.map((artist) => (
                <div key={artist.id} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-panelSoft">
                  <Link href={`/artists/${artist.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <ArtistAvatar artist={artist} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black">{artist.name}</span>
                      <span className="text-xs text-paper/45">${artist.ticker}</span>
                    </span>
                  </Link>
                  <WatchlistButton artistId={artist.id} />
                </div>
              )) : <p className="px-3 py-5 text-center text-sm text-paper/50">No matching artists.</p>}
            </div>
          ) : null}
        </div>
      </header>

      {watchlistArtists.length ? (
        <section>
          <div className="mb-3">
            <h2 className="text-base font-black">Watchlist Briefing</h2>
            <p className="mt-1 text-sm text-paper/50">The strongest quote and signal activity among the artists you follow.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
              {biggestMover ? <WatchlistInsight label="Biggest Move" artist={biggestMover} value={<ChangeText value={biggestMover.dailyChangePercent} />} /> : null}
              {signalLeader ? <WatchlistInsight label="Signal Leader" artist={signalLeader} value={`${signalLeader.hypeScore}/100`} /> : null}
              <div className="rmi-card grid grid-cols-3 gap-2 p-4 text-center text-xs">
                <BriefingCount label="Up" value={breadth.advancers} tone="good" />
                <BriefingCount label="Down" value={breadth.decliners} tone="bad" />
                <BriefingCount label="Flat" value={breadth.unchanged} />
              </div>
          </div>
        </section>
      ) : null}

      <section className="rmi-card overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1fr)_78px_64px_40px] gap-x-3 border-b border-line px-4 py-3 text-xs font-bold text-paper/45 sm:grid-cols-[minmax(0,1fr)_96px_76px_60px_40px]">
          <span>Artist</span>
          <span className="text-right">Price</span>
          <span className="text-right">24h</span>
          <span className="hidden text-right sm:block">Signal</span>
          <span className="sr-only">remove from watchlist</span>
        </div>
        {watchlistArtists.length ? (
          watchlistArtists.map((artist) => (
            <div
              key={artist.id}
              className="grid grid-cols-[minmax(0,1fr)_78px_64px_40px] items-center gap-x-3 border-b border-line px-4 py-3 last:border-b-0 hover:bg-panelSoft sm:grid-cols-[minmax(0,1fr)_96px_76px_60px_40px]"
            >
              <Link href={`/artists/${artist.id}`} className="flex min-w-0 items-center gap-3">
                <ArtistAvatar artist={artist} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black">{artist.name}</span>
                  <span className="text-xs font-bold text-paper/45">${artist.ticker}</span>
                </span>
              </Link>
              <span className="text-right text-sm font-black number-tabular">{formatCurrency(artist.currentPrice)}</span>
              <span className="text-right text-xs">
                <ChangeText value={artist.dailyChangePercent} />
              </span>
              <span className="hidden text-right text-xs font-black text-paper/55 sm:block">{artist.hypeScore}</span>
              <WatchlistButton artistId={artist.id} />
            </div>
          ))
        ) : (
          <div className="grid min-h-48 place-items-center p-6 text-center">
            <div>
              <h2 className="text-lg font-black">Build your market radar</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-paper/55">
                Save artists to compare their quote movement, signal strength, and verified catalysts in one place.
              </p>
              <div className="mt-4"><RmiButton href="/markets">Browse Markets</RmiButton></div>
            </div>
          </div>
        )}
      </section>

      {watchlistArtists.length ? (
        <RmiSection
          title="Watchlist News"
          subtitle="Verified, price-relevant catalysts for the artists you follow."
          action={<Link href="/news" className="text-xs font-bold text-cyan">All Market News</Link>}
        >
          <div className="px-4">
            <MarketNewsFeed artistIds={watchlistArtists.map((artist) => artist.id)} limit={8} compact />
          </div>
        </RmiSection>
      ) : null}
    </div>
  );
}

function WatchlistInsight({ label, artist, value }: { label: string; artist: Parameters<typeof ArtistIdentity>[0]["artist"]; value: React.ReactNode }) {
  return (
    <div className="rmi-card p-4">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-paper/40">{label}</p>
      <div className="flex items-center justify-between gap-3">
        <ArtistIdentity artist={artist} />
        <span className="text-sm font-black number-tabular">{value}</span>
      </div>
    </div>
  );
}

function BriefingCount({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "good" | "bad" }) {
  return (
    <div className="rounded-lg bg-panelSoft px-2 py-3">
      <p className="text-paper/45">{label}</p>
      <p className={tone === "good" ? "mt-1 font-black text-mint" : tone === "bad" ? "mt-1 font-black text-ember" : "mt-1 font-black"}>{value}</p>
    </div>
  );
}
