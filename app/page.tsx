"use client";

import { useAuth } from "@/components/AuthProvider";
import { useGame } from "@/components/GameProvider";
import { ArtistIdentity, ArtistMiniCard, ChangeText, RmiButton, RmiSection } from "@/components/RmiPrimitives";
import { formatCompact, formatCurrency, formatPercent } from "@/lib/formatters";
import type { Artist } from "@/lib/types";
import { Flame, KeyRound, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export default function HomePage() {
  const router = useRouter();
  const { session } = useAuth();
  const { state, portfolioValue, gainPercent } = useGame();
  const [query, setQuery] = useState("");

  const orderedMovers = useMemo(
    () => [...state.artists].sort((a, b) => Math.abs(b.dailyChangePercent) - Math.abs(a.dailyChangePercent)),
    [state.artists]
  );
  const trending = orderedMovers.slice(0, 8);
  const catalysts = useMemo(
    () => [...state.artists].sort((a, b) => Math.abs(b.dailyChangePercent) - Math.abs(a.dailyChangePercent)).slice(0, 3),
    [state.artists]
  );
  const marketCap = useMemo(
    () => state.artists.reduce((total, artist) => total + artist.currentPrice * Math.max(250000, artist.hypeScore * 18000), 0),
    [state.artists]
  );
  const volume = useMemo(
    () => state.artists.reduce((total, artist) => total + Math.abs(artist.dailyChangePercent) * artist.currentPrice * 12000, 0),
    [state.artists]
  );
  const marketLeader = [...state.artists].sort((a, b) => b.dailyChangePercent - a.dailyChangePercent)[0];
  const underPressure = [...state.artists].sort((a, b) => a.dailyChangePercent - b.dailyChangePercent)[0];
  const signalLeader = [...state.artists].sort((a, b) => b.hypeScore - a.hypeScore)[0];
  const activeMovers = state.artists.filter((artist) => Math.abs(artist.dailyChangePercent) >= 0.25).length;

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
      router.push(`/artists/${match.id}`);
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid overflow-hidden rounded-xl border border-line bg-panel lg:grid-cols-[minmax(0,1.45fr)_minmax(290px,0.55fr)]">
        <div className="grid content-center px-6 py-10 text-center sm:px-10 lg:min-h-[300px] lg:text-left">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan">Rap Market Index</p>
          <h1 className="mt-3 text-3xl font-black leading-tight sm:text-5xl">Back the next breakout.</h1>
          <p className="mt-3 text-base font-bold text-paper/75">Buy shares in rappers. Build a portfolio when they blow up.</p>
          <form onSubmit={submitSearch} className="mx-auto mt-6 flex w-full max-w-xl gap-2 lg:mx-0">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-panelSoft px-3 text-sm outline-none placeholder:text-paper/35 focus:border-cyan"
              placeholder="Search an artist, e.g. Ken Carson"
            />
            <RmiButton type="submit">Search</RmiButton>
          </form>
        </div>

        <div className="grid divide-y divide-line border-t border-line bg-panelSoft lg:border-l lg:border-t-0">
          {marketLeader ? <PulseArtist label="Market leader" artist={marketLeader} /> : null}
          {underPressure ? <PulseArtist label="Under pressure" artist={underPressure} /> : null}
          {signalLeader ? <PulseArtist label="Signal leader" artist={signalLeader} score /> : null}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <HeroStat label="market cap" value={`$${formatCompact(marketCap)}`} />
        <HeroStat label="24h volume" value={`$${formatCompact(volume)}`} />
        <HeroStat label="artists listed" value={formatCompact(state.artists.length)} />
        <HeroStat label="active movers" value={formatCompact(activeMovers)} />
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
        <RmiSection title="Catalysts this week">
          <div className="grid gap-3 p-4">
            {catalysts.map((artist, index) => (
              <Link
                key={artist.id}
                href={`/artists/${artist.id}`}
                className="grid grid-cols-[22px_minmax(0,1fr)_72px] items-center gap-2 text-sm"
              >
                <CatalystIcon index={index} />
                <span className="min-w-0 truncate font-black">
                  {artist.name} - {artist.lastMoveExplanation.replace(`${artist.ticker} `, "").slice(0, 70)}
                </span>
                <ChangeText value={artist.dailyChangePercent} />
              </Link>
            ))}
          </div>
        </RmiSection>

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

function CatalystIcon({ index }: { index: number }) {
  const icons = [KeyRound, Flame, Trophy];
  const Icon = icons[index] ?? Flame;

  return <Icon className="h-4 w-4 text-paper/45" aria-hidden="true" />;
}
