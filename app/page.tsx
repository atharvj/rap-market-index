"use client";

import { useAuth } from "@/components/AuthProvider";
import { useGame } from "@/components/GameProvider";
import { ArtistMiniCard, ChangeText, RmiButton, RmiSection } from "@/components/RmiPrimitives";
import { formatCompact, formatCurrency, formatPercent } from "@/lib/formatters";
import { CalendarDays, Flame, KeyRound, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";

export default function HomePage() {
  const router = useRouter();
  const { session } = useAuth();
  const { state, leaderboard, portfolioValue, gainPercent } = useGame();
  const [query, setQuery] = useState("");

  const trending = useMemo(
    () => [...state.artists].sort((a, b) => Math.abs(b.dailyChangePercent) - Math.abs(a.dailyChangePercent)).slice(0, 4),
    [state.artists]
  );
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
      <section className="border-b border-line pb-6 text-center">
        <h1 className="text-3xl font-black leading-tight sm:text-4xl">Trade the culture</h1>
        <p className="mt-2 text-base font-bold text-paper/75">Buy shares in rappers. Build a portfolio when they blow up.</p>
        <form onSubmit={submitSearch} className="mx-auto mt-5 flex max-w-md gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-h-10 min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 text-sm font-bold outline-none placeholder:text-paper/35 focus:border-cyan"
            placeholder="Search an artist, e.g. Ken Carson"
          />
          <RmiButton type="submit">Search</RmiButton>
        </form>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <HeroStat label="market cap" value={`$${formatCompact(marketCap)}`} />
        <HeroStat label="24h volume" value={`$${formatCompact(volume)}`} />
        <HeroStat label="artists listed" value={formatCompact(state.artists.length)} />
        <HeroStat label="traders online" value={formatCompact(Math.max(leaderboard.length, 1))} />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-black">Trending now</h2>
          <Link href="/markets" className="text-sm font-bold text-paper/55 hover:text-cyan">
            Markets
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {trending.map((artist) => (
            <ArtistMiniCard key={artist.id} artist={artist} />
          ))}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
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

        <RmiSection title={session ? "Your leagues" : "Start trading"}>
          {session ? (
            <div className="space-y-4 p-4 text-sm">
              <LeagueRow icon={<Trophy className="h-4 w-4" />} title="RMI Global" detail={`rank ${leaderboard.findIndex((entry) => entry.isCurrentUser) + 1 || "-"} of ${leaderboard.length}`} />
              <LeagueRow icon={<CalendarDays className="h-4 w-4" />} title="Rookie Board" detail="open league" />
              <RmiButton href="/leagues" variant="secondary">Join a league</RmiButton>
            </div>
          ) : (
            <div className="space-y-4 p-4 text-sm">
              <p className="font-bold leading-5 text-paper/70">Create a portfolio, follow catalysts, and compete on rankings. No real money.</p>
              <RmiButton href="/account?mode=signup">Sign up</RmiButton>
            </div>
          )}
        </RmiSection>
      </div>

      <RmiSection title="Market snapshot" action={<RmiButton href="/portfolio" variant="secondary">Portfolio</RmiButton>}>
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <SnapshotTile label="portfolio" value={formatCurrency(portfolioValue)} />
          <SnapshotTile label="cash" value={formatCurrency(state.cashBalance)} />
          <SnapshotTile label="today" value={formatPercent(gainPercent)} positive={gainPercent >= 0} />
        </div>
      </RmiSection>
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

function LeagueRow({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-paper/45">{icon}</span>
      <div>
        <p className="font-black">{title}</p>
        <p className="text-paper/55">{detail}</p>
      </div>
    </div>
  );
}
