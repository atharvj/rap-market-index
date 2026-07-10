"use client";

import { ArtistAvatar } from "@/components/ArtistAvatar";
import { useGame } from "@/components/GameProvider";
import { ChangeText, RmiButton, RmiLineChart } from "@/components/RmiPrimitives";
import { WatchlistButton } from "@/components/WatchlistButton";
import { formatCurrency } from "@/lib/formatters";
import { ArrowDownAZ, ArrowDownUp, ArrowUpAZ } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

type SortKey = "name" | "price" | "change";

export default function MarketsPage() {
  const { state } = useGame();
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("change");
  const [sortDescending, setSortDescending] = useState(true);
  const artists = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return [...state.artists]
      .filter(
        (artist) =>
          !normalized ||
          artist.name.toLowerCase().includes(normalized) ||
          artist.ticker.toLowerCase().includes(normalized)
      )
      .sort((first, second) => {
        const direction = sortDescending ? -1 : 1;

        if (sortKey === "name") {
          return first.name.localeCompare(second.name) * direction;
        }

        const firstValue = sortKey === "price" ? first.currentPrice : first.dailyChangePercent;
        const secondValue = sortKey === "price" ? second.currentPrice : second.dailyChangePercent;
        return (firstValue - secondValue) * direction;
      });
  }, [query, sortDescending, sortKey, state.artists]);

  function chooseSort(nextSortKey: SortKey) {
    if (sortKey === nextSortKey) {
      setSortDescending((current) => !current);
      return;
    }

    setSortKey(nextSortKey);
    setSortDescending(nextSortKey !== "name");
  }

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">Markets</h1>
          <p className="mt-1 text-sm font-bold text-paper/70">{artists.length} artists listed</p>
        </div>
        <RmiButton href="/scout" variant="secondary">Scout artists</RmiButton>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 text-sm outline-none placeholder:text-paper/35 focus:border-cyan"
          placeholder="Search artist or ticker"
        />
        <div className="flex items-center gap-1 rounded-lg border border-line bg-panel p-1" aria-label="Sort markets">
          <SortButton active={sortKey === "name"} onClick={() => chooseSort("name")}>Name</SortButton>
          <SortButton active={sortKey === "price"} onClick={() => chooseSort("price")}>Price</SortButton>
          <SortButton active={sortKey === "change"} onClick={() => chooseSort("change")}>24h</SortButton>
          <span className="grid h-8 w-8 place-items-center text-paper/45" title={sortDescending ? "Descending" : "Ascending"}>
            {sortKey === "name" ? (
              sortDescending ? <ArrowDownAZ className="h-4 w-4" /> : <ArrowUpAZ className="h-4 w-4" />
            ) : (
              <ArrowDownUp className="h-4 w-4" />
            )}
          </span>
        </div>
      </div>

      <section className="rmi-card overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1fr)_96px_76px_40px] gap-x-3 border-b border-line px-4 py-3 text-xs font-bold text-paper/45">
          <span>artist</span>
          <span className="text-right">price</span>
          <span className="text-right">24h</span>
          <span className="sr-only">watchlist</span>
        </div>
        {artists.map((artist) => (
          <div
            key={artist.id}
            className="grid grid-cols-[minmax(0,1fr)_96px_76px_40px] items-center gap-x-3 border-b border-line px-4 py-3 last:border-b-0 hover:bg-panelSoft"
          >
            <Link href={`/artists/${artist.id}`} className="flex min-w-0 items-center gap-3">
              <ArtistAvatar artist={artist} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-black">{artist.name}</span>
                <span className="block truncate text-xs font-bold text-paper/45">${artist.ticker}</span>
              </span>
            </Link>
            <span className="text-right text-sm font-black number-tabular">{formatCurrency(artist.currentPrice)}</span>
            <span className="text-right text-xs">
              <ChangeText value={artist.dailyChangePercent} />
            </span>
            <WatchlistButton artistId={artist.id} />
          </div>
        ))}
      </section>

      <section className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        {artists.slice(0, 8).map((artist) => (
          <Link key={artist.id} href={`/artists/${artist.id}`} className="rmi-card p-4 hover:border-cyan/70">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <ArtistAvatar artist={artist} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">{artist.name}</p>
                  <p className="text-xs font-bold text-paper/45">${artist.ticker} · {formatCurrency(artist.currentPrice)}</p>
                </div>
              </div>
              <ChangeText value={artist.dailyChangePercent} />
            </div>
            <div className="mt-4 h-16">
              <RmiLineChart data={artist.priceHistory} positive={artist.dailyChangePercent >= 0} height={72} />
            </div>
            <p className="mt-2 text-xs font-black text-paper/45">{artist.hypeScore}/100 RMI score</p>
          </Link>
        ))}
      </section>
    </div>
  );
}

function SortButton({
  active,
  children,
  onClick
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active ? "h-8 rounded-md bg-paper px-3 text-xs font-bold text-ink" : "h-8 rounded-md px-3 text-xs font-bold text-paper/55 hover:text-paper"}
    >
      {children}
    </button>
  );
}
