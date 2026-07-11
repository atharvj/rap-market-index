"use client";

import { ArtistAvatar } from "@/components/ArtistAvatar";
import { useGame } from "@/components/GameProvider";
import { ArtistIdentity, ChangeText, RmiButton, RmiLineChart, RmiSection } from "@/components/RmiPrimitives";
import { WatchlistButton } from "@/components/WatchlistButton";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import { buildMarketIndexSeries, getMarketBreadth, getSeriesChangePercent } from "@/lib/market-analytics";
import { ArrowDown, ArrowDownAZ, ArrowUp, ArrowUpAZ } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

type SortKey = "name" | "price" | "change";

export default function MarketsPage() {
  const { state } = useGame();
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("change");
  const [sortDescending, setSortDescending] = useState(true);
  const marketIndex = useMemo(() => buildMarketIndexSeries(state.artists), [state.artists]);
  const marketIndexChange = getSeriesChangePercent(marketIndex);
  const breadth = getMarketBreadth(state.artists);
  const leadingMovers = useMemo(
    () => [...state.artists].sort((first, second) => Math.abs(second.dailyChangePercent) - Math.abs(first.dailyChangePercent)).slice(0, 4),
    [state.artists]
  );
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
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">Markets</h1>
          <p className="mt-1 text-sm font-bold text-paper/70">{artists.length} artists listed</p>
        </div>
        <RmiButton href="/scout" variant="secondary">Scout artists</RmiButton>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <RmiSection
          title="Market Overview"
          subtitle="Equal-weight RMI index built from recorded artist quotes."
          action={
            <span className={marketIndexChange >= 0 ? "text-sm font-black text-mint number-tabular" : "text-sm font-black text-ember number-tabular"}>
              {formatPercent(marketIndexChange)}
            </span>
          }
        >
          <div className="h-40 p-4">
            <RmiLineChart data={marketIndex} positive={marketIndexChange >= 0} height={150} />
          </div>
        </RmiSection>

        <RmiSection title="Session Breadth" subtitle="How much of the board is participating today.">
          <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-3 lg:grid-cols-1">
            <BreadthRow label="Advancing" value={breadth.advancers} tone="good" />
            <BreadthRow label="Declining" value={breadth.decliners} tone="bad" />
            <BreadthRow label="Unchanged" value={breadth.unchanged} />
          </div>
        </RmiSection>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-black">Leading Movers</h2>
            <p className="mt-1 text-sm text-paper/50">Largest absolute quote changes in the current session.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {leadingMovers.map((artist) => <MarketMoverCard key={artist.id} artist={artist} />)}
        </div>
      </section>

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
          <button
            type="button"
            onClick={() => setSortDescending((current) => !current)}
            className="grid h-8 w-8 place-items-center rounded-md text-paper/45 hover:bg-panelSoft hover:text-paper"
            title={sortDescending ? "Change to ascending" : "Change to descending"}
            aria-label={sortDescending ? "Change to ascending order" : "Change to descending order"}
          >
            {sortKey === "name" ? (
              sortDescending ? <ArrowDownAZ className="h-4 w-4" /> : <ArrowUpAZ className="h-4 w-4" />
            ) : (
              sortDescending ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <section className="rmi-card overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1fr)_104px_84px_44px] gap-x-4 border-b border-line px-4 py-3 text-xs font-bold text-paper/45">
          <span>artist</span>
          <span className="text-right">price</span>
          <span className="text-right">24h</span>
          <span className="sr-only">watchlist</span>
        </div>
        {artists.map((artist) => (
          <div
            key={artist.id}
            className="grid grid-cols-[minmax(0,1fr)_104px_84px_44px] items-center gap-x-4 border-b border-line px-4 py-3 last:border-b-0 hover:bg-panelSoft"
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
    </div>
  );
}

function MarketMoverCard({ artist }: { artist: ReturnType<typeof useGame>["state"]["artists"][number] }) {
  return (
    <Link href={`/artists/${artist.id}`} className="rmi-card p-4 transition hover:-translate-y-0.5 hover:border-cyan/60">
      <div className="flex items-start justify-between gap-3">
        <ArtistIdentity artist={artist} linked={false} />
        <ChangeText value={artist.dailyChangePercent} />
      </div>
      <div className="mt-4 h-16">
        <RmiLineChart data={artist.priceHistory} positive={artist.dailyChangePercent >= 0} height={72} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs font-bold text-paper/45">
        <span>{formatCurrency(artist.currentPrice)}</span>
        <span>{artist.hypeScore}/100 signal</span>
      </div>
    </Link>
  );
}

function BreadthRow({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "good" | "bad" }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-panelSoft px-3 py-2 text-sm">
      <span className="font-bold text-paper/60">{label}</span>
      <span className={tone === "good" ? "font-black text-mint number-tabular" : tone === "bad" ? "font-black text-ember number-tabular" : "font-black number-tabular"}>
        {value}
      </span>
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
