"use client";

import { ArtistAvatar } from "@/components/ArtistAvatar";
import { ChangePill } from "@/components/ChangePill";
import { useGame } from "@/components/GameProvider";
import { MetricCard } from "@/components/MetricCard";
import { TradeTicket } from "@/components/TradeTicket";
import { WatchlistButton } from "@/components/WatchlistButton";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import { STARTING_CASH } from "@/lib/market";
import type { Artist, ArtistCategory } from "@/lib/types";
import clsx from "clsx";
import { Flame, Search, Sparkles, TrendingUp, WalletCards } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const categoryFilters: Array<"all" | ArtistCategory> = [
  "all",
  "superstar",
  "mainstream",
  "rising",
  "underground"
];

export default function MarketPage() {
  const { state, portfolioValue, portfolioDayChange } = useGame();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof categoryFilters)[number]>("all");
  const [selectedArtistId, setSelectedArtistId] = useState(state.artists[0]?.id ?? "");
  const [ticketKey, setTicketKey] = useState(0);
  const [side, setSide] = useState<"buy" | "sell">("buy");

  const selectedArtist = state.artists.find((artist) => artist.id === selectedArtistId) ?? state.artists[0];

  const filteredArtists = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return state.artists.filter((artist) => {
      const matchesCategory = category === "all" || artist.category === category;
      const matchesQuery =
        !normalizedQuery ||
        artist.name.toLowerCase().includes(normalizedQuery) ||
        artist.ticker.toLowerCase().includes(normalizedQuery);

      return matchesCategory && matchesQuery;
    });
  }, [category, query, state.artists]);

  const topMover = [...state.artists].sort((a, b) => b.dailyChangePercent - a.dailyChangePercent)[0];
  const topHype = [...state.artists].sort((a, b) => b.hypeScore - a.hypeScore)[0];

  function openTicket(artist: Artist, nextSide: "buy" | "sell") {
    setSelectedArtistId(artist.id);
    setSide(nextSide);
    setTicketKey((value) => value + 1);
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-md border border-line bg-panel/86 shadow-market">
        <div className="grid gap-0 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="border-b border-line p-5 sm:p-6 lg:border-b-0 lg:border-r">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-brass/35 bg-brass/10 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-brass">
                Virtual market
              </span>
              <span className="rounded-md border border-line bg-black/20 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-paper/52">
                Continuous trading
              </span>
            </div>
            <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight sm:text-5xl">
              Artist shares move on momentum, audience growth, media, and trading demand.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-paper/62">
              Prices respond to audience momentum, video activity, discovery trends, fan sentiment, release activity,
              media movement, and order flow.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <MetricCard
                label="Cash"
                value={formatCurrency(state.cashBalance)}
                detail={`Starting bank ${formatCurrency(STARTING_CASH)}`}
                icon={<WalletCards className="h-4 w-4" />}
                tone="warm"
              />
              <MetricCard
                label="Portfolio"
                value={formatCurrency(portfolioValue)}
                detail={`${formatCurrency(portfolioDayChange)} today`}
                icon={<TrendingUp className="h-4 w-4" />}
                tone={portfolioDayChange >= 0 ? "good" : "bad"}
              />
              <MetricCard
                label="Top signal"
                value={topHype?.ticker ?? "N/A"}
                detail={topHype ? `${topHype.hypeScore}/100 market signal` : undefined}
                icon={<Sparkles className="h-4 w-4" />}
                tone="cool"
              />
            </div>
          </div>

          <aside className="p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-paper/50">Market mover</p>
                <h2 className="mt-1 text-2xl font-black">{topMover?.ticker ?? "N/A"}</h2>
              </div>
              {topMover ? <ChangePill value={topMover.dailyChangePercent} /> : null}
            </div>
            {topMover ? (
              <div className="mt-5 flex items-center gap-4">
                <ArtistAvatar artist={topMover} size="lg" />
                <div>
                  <p className="font-black">{topMover.name}</p>
                  <p className="mt-1 text-sm leading-6 text-paper/58">{topMover.lastMoveExplanation}</p>
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-md border border-line bg-panel/86 shadow-market">
          <div className="flex flex-col gap-3 border-b border-line p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-black">Market board</h2>
              <p className="mt-1 text-sm text-paper/50">{filteredArtists.length} listed artists</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative block min-w-56">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/35" />
                <input
                  className="h-10 w-full rounded-md border border-line bg-black/25 pl-9 pr-3 text-sm outline-none placeholder:text-paper/35 focus:border-brass"
                  placeholder="Search artist or ticker"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto border-b border-line p-4 scrollbar-thin">
            {categoryFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setCategory(filter)}
                className={clsx(
                  "min-h-9 shrink-0 rounded-md border px-3 text-sm font-bold capitalize transition",
                  category === filter
                    ? "border-brass bg-brass/90 text-ink"
                    : "border-line bg-black/20 text-paper/60 hover:border-paper/25 hover:text-paper"
                )}
              >
                {filter}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[780px] border-collapse">
              <thead>
                <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-paper/42">
                  <th className="px-4 py-3">Artist</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">Daily</th>
                  <th className="px-4 py-3 text-right">Signal</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-right">Trade</th>
                </tr>
              </thead>
              <tbody>
                {filteredArtists.map((artist) => (
                  <tr key={artist.id} className="border-b border-line/70 last:border-0 hover:bg-white/[0.028]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <WatchlistButton artistId={artist.id} />
                        <Link href={`/artists/${artist.id}`} className="flex min-w-0 items-center gap-3">
                          <ArtistAvatar artist={artist} />
                          <span className="min-w-0">
                            <span className="block truncate font-black">{artist.name}</span>
                            <span className="text-sm font-bold text-paper/45">{artist.ticker}</span>
                          </span>
                        </Link>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-black number-tabular">
                      {formatCurrency(artist.currentPrice)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ChangePill value={artist.dailyChangePercent} />
                    </td>
                    <td className="px-4 py-3 text-right font-black number-tabular">{artist.hypeScore}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-md border border-line bg-black/20 px-2.5 py-1 text-xs font-bold capitalize text-paper/65">
                        {artist.category}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openTicket(artist, "buy")}
                          className="min-h-9 rounded-md bg-mint/90 px-3 text-sm font-black text-ink hover:bg-mint"
                        >
                          Buy
                        </button>
                        <button
                          type="button"
                          onClick={() => openTicket(artist, "sell")}
                          className="min-h-9 rounded-md border border-ember/35 bg-ember/10 px-3 text-sm font-black text-ember hover:bg-ember/15"
                        >
                          Sell
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="lg:sticky lg:top-36 lg:self-start">
          {selectedArtist ? <TradeTicket key={`${selectedArtist.id}-${side}-${ticketKey}`} artist={selectedArtist} defaultSide={side} /> : null}
          <section className="mt-4 rounded-md border border-line bg-panel/80 p-4 shadow-market">
            <div className="flex items-center gap-2 text-sm font-bold text-paper/62">
              <Flame className="h-4 w-4 text-brass" />
              Total gain
            </div>
            <p className="mt-2 text-3xl font-black number-tabular">
              {formatPercent(((portfolioValue - STARTING_CASH) / STARTING_CASH) * 100)}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
