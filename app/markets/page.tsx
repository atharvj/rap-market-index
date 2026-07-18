"use client";

import { ArtistAvatar } from "@/components/ArtistAvatar";
import { useGame } from "@/components/GameProvider";
import { ChangeText, RmiButton, RmiSection } from "@/components/RmiPrimitives";
import { PriceChart } from "@/components/PriceChart";
import { WatchlistButton } from "@/components/WatchlistButton";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import { buildMarketIndexSeries, getMarketBreadth, getSeriesChangePercent } from "@/lib/market-analytics";
import { Activity, ArrowDown, ArrowDownAZ, ArrowUp, ArrowUpAZ, Radar, Search, Signal } from "lucide-react";
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
      <header className="rmi-page-head flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="rmi-kicker"><Activity className="h-4 w-4" /> Live Exchange</div>
          <h1 className="mt-3 text-4xl font-black">Artist Markets</h1>
          <p className="mt-2 max-w-2xl text-sm text-paper/60">Scan every active quote, compare momentum, and move from market signal to artist research in one view.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rmi-status-chip" data-tone="mint"><span className="rmi-live-dot" /> {artists.length} Live Listings</span>
          <RmiButton href="/scout" variant="secondary"><Radar className="h-4 w-4" /> Scout Artists</RmiButton>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <RmiSection
          title={<span className="flex items-center gap-2"><Signal className="h-4 w-4 text-cyan" /> RMI Market Pulse</span>}
          subtitle="Equal-weight quote movement across every active artist over recorded market sessions."
          action={
            <span className={marketIndexChange >= 0 ? "text-sm font-black text-mint number-tabular" : "text-sm font-black text-ember number-tabular"}>
              {formatPercent(marketIndexChange)}
            </span>
          }
        >
          <div className="rmi-chart-shell m-4">
            <PriceChart data={marketIndex} height={190} />
          </div>
        </RmiSection>

        <RmiSection title="Signal Breadth" subtitle="How much of the artist board is participating in today's move.">
          <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-3 lg:grid-cols-1">
            <BreadthRow label="Advancing" value={breadth.advancers} tone="good" />
            <BreadthRow label="Declining" value={breadth.decliners} tone="bad" />
            <BreadthRow label="Unchanged" value={breadth.unchanged} />
          </div>
        </RmiSection>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <label className="rmi-terminal-input flex items-center gap-3 px-4">
          <Search className="h-4 w-4 shrink-0 text-cyan" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-paper/35"
            placeholder="Search artist or ticker"
          />
          <span className="hidden text-[10px] font-black uppercase tracking-[0.18em] text-paper/35 sm:block">{artists.length} Results</span>
        </label>
        <div className="flex items-center gap-1 rounded-lg border border-line bg-panel/85 p-1 shadow-market" aria-label="Sort markets">
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
        <div className="rmi-table-head grid grid-cols-[minmax(0,1fr)_104px_84px_44px] gap-x-4 px-4 py-3">
          <span>Artist</span>
          <span className="text-right">Price</span>
          <span className="text-right">24h</span>
          <span className="sr-only">watchlist</span>
        </div>
        {artists.map((artist) => (
          <div
            key={artist.id}
            className="rmi-table-row grid grid-cols-[minmax(0,1fr)_104px_84px_44px] items-center gap-x-4 px-4 py-3 last:border-b-0"
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

function BreadthRow({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "good" | "bad" }) {
  return (
    <div className="rmi-metric flex items-center justify-between gap-3 px-3 py-3 text-sm">
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
